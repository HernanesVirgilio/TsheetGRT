// Edge Function: admin-create-user
//
// Convida um novo utilizador (Supabase Auth) e cria o respetivo perfil e perfil de acesso.
//
// Segurança:
//   * A service_role é usada exclusivamente para o convite (auth.admin), que não é possível sem ela.
//   * O perfil e o role são criados com o JWT de quem fez o pedido, através de
//     public.create_user_profile (SECURITY INVOKER): as políticas RLS e a auditoria aplicam-se.
//   * Se a criação do perfil falhar, o convite é revertido.
//
// Variáveis de ambiente:
//   SUPABASE_URL                                   (fornecida pelo Supabase)
//   SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEYS  (fornecidas pelo Supabase)
//   SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEYS (fornecidas pelo Supabase; nunca saem do servidor)
//   APP_URL          secret obrigatório: URL público do frontend (destino do link de convite)
//   ALLOWED_ORIGINS  secret opcional: outras origens autorizadas por CORS, separadas por vírgula
//                    (ex.: http://localhost:3000 para desenvolvimento)

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const ROLE_CODES = ['ADMIN', 'IT', 'MANAGER', 'EMPLOYEE'] as const;
type RoleCode = (typeof ROLE_CODES)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_NAME_LENGTH = 255;
const MAX_JOB_TITLE_LENGTH = 150;
const MAX_PHONE_LENGTH = 50;

interface CreateUserRequest {
  fullName: string;
  email: string;
  roleCode: RoleCode;
  departmentId: string;
  jobTitle: string | null;
  phone: string | null;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Variável de ambiente em falta: ${name}`);
  }
  return value;
}

/** Aceita a chave legada ou a primeira das novas chaves (JSON {"nome":"chave"} ou valor simples). */
function requireKey(legacyName: string, newName: string): string {
  const legacyValue = Deno.env.get(legacyName);
  if (legacyValue) return legacyValue;
  const newValue = Deno.env.get(newName)?.trim();
  if (newValue?.startsWith('{')) {
    const parsed: unknown = JSON.parse(newValue);
    const firstKey =
      typeof parsed === 'object' && parsed !== null
        ? Object.values(parsed).find((value): value is string => typeof value === 'string' && value.length > 0)
        : undefined;
    if (firstKey) return firstKey;
  } else if (newValue) {
    return newValue;
  }
  throw new Error(`Variável de ambiente em falta: ${legacyName} ou ${newName}`);
}

function allowedOrigin(request: Request, appUrl: string): string {
  const allowed = [
    new URL(appUrl).origin,
    ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  ];
  const origin = request.headers.get('Origin');
  return origin && allowed.includes(origin) ? origin : allowed[0];
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function jsonResponse(status: number, body: Record<string, unknown>, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function readOptionalText(value: unknown, maxLength: number, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${label} inválido.`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new Error(`${label} excede ${maxLength} carateres.`);
  return trimmed.length > 0 ? trimmed : null;
}

function parseRequest(body: unknown): CreateUserRequest {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Pedido inválido.');
  }
  const input = body as Record<string, unknown>;

  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
  if (fullName.length < 2 || fullName.length > MAX_NAME_LENGTH) {
    throw new Error('O nome completo deve ter entre 2 e 255 carateres.');
  }

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('Indique um endereço de e-mail válido.');
  }

  const roleCode = input.roleCode;
  if (typeof roleCode !== 'string' || !ROLE_CODES.includes(roleCode as RoleCode)) {
    throw new Error('Perfil de acesso inválido.');
  }

  const departmentId = input.departmentId;
  if (typeof departmentId !== 'string' || !UUID_PATTERN.test(departmentId)) {
    throw new Error('Selecione um departamento válido.');
  }

  return {
    fullName,
    email,
    roleCode: roleCode as RoleCode,
    departmentId,
    jobTitle: readOptionalText(input.jobTitle, MAX_JOB_TITLE_LENGTH, 'Cargo'),
    phone: readOptionalText(input.phone, MAX_PHONE_LENGTH, 'Telefone'),
  };
}

async function hasPermission(userClient: SupabaseClient, permissionCode: string): Promise<boolean> {
  const { data, error } = await userClient.rpc('has_permission', { p_permission_code: permissionCode });
  if (error) throw new Error('Não foi possível validar as permissões.');
  return data === true;
}

function describeProfileError(code: string | undefined, message: string): string {
  if (code === '23505') return 'Já existe um utilizador com este e-mail.';
  if (code === '42501') return 'Não tem permissão para criar utilizadores com este perfil de acesso.';
  return message;
}

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};

  try {
    const appUrl = requireEnv('APP_URL');
    headers = corsHeaders(allowedOrigin(request, appUrl));

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Método não suportado.' }, headers);
    }

    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse(401, { error: 'Sessão inválida. Inicie sessão novamente.' }, headers);
    }

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const userClient = createClient(supabaseUrl, requireKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS'), {
      global: {
        headers: {
          Authorization: authorization,
          'User-Agent': request.headers.get('User-Agent') ?? 'admin-create-user',
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse(401, { error: 'Sessão inválida ou expirada. Inicie sessão novamente.' }, headers);
    }

    if (!(await hasPermission(userClient, 'USERS_CREATE'))) {
      return jsonResponse(403, { error: 'Não tem permissão para criar utilizadores.' }, headers);
    }
    if (!(await hasPermission(userClient, 'USERS_ASSIGN_ROLE'))) {
      return jsonResponse(403, { error: 'Não tem permissão para atribuir perfis de acesso.' }, headers);
    }

    let input: CreateUserRequest;
    try {
      input = parseRequest(await request.json());
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : 'Pedido inválido.';
      return jsonResponse(400, { error: message }, headers);
    }

    const adminClient = createClient(supabaseUrl, requireKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', input.email)
      .maybeSingle();
    if (existingProfile) {
      return jsonResponse(409, { error: 'Já existe um utilizador com este e-mail.' }, headers);
    }

    const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${appUrl.replace(/\/$/, '')}/reset-password`,
      data: { full_name: input.fullName },
    });
    if (inviteError || !invite.user) {
      const alreadyRegistered = inviteError?.message.toLowerCase().includes('already');
      return jsonResponse(
        alreadyRegistered ? 409 : 502,
        {
          error: alreadyRegistered
            ? 'Já existe uma conta de autenticação com este e-mail.'
            : 'Não foi possível enviar o convite. Verifique a configuração de e-mail do Supabase.',
        },
        headers
      );
    }

    const { data: profileId, error: profileError } = await userClient.rpc('create_user_profile', {
      p_auth_user_id: invite.user.id,
      p_full_name: input.fullName,
      p_email: input.email,
      p_role_code: input.roleCode,
      p_department_id: input.departmentId,
      p_job_title: input.jobTitle,
      p_phone: input.phone,
    });

    if (profileError) {
      // Reverte o convite; uma falha na reversão não deve esconder o erro original.
      try {
        const { error: rollbackError } = await adminClient.auth.admin.deleteUser(invite.user.id);
        if (rollbackError) console.error('admin-create-user: falha ao reverter convite', rollbackError.message);
      } catch (rollbackException) {
        console.error('admin-create-user: falha ao reverter convite', rollbackException);
      }
      return jsonResponse(400, { error: describeProfileError(profileError.code, profileError.message) }, headers);
    }

    return jsonResponse(201, { profileId }, headers);
  } catch (unexpectedError) {
    console.error('admin-create-user', unexpectedError);
    return jsonResponse(500, { error: 'Erro interno ao criar o utilizador.' }, headers);
  }
});
