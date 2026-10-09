// Ambiente de teste da base de dados: PostgreSQL 17 (PGlite) com um stub do ambiente Supabase
// (roles anon/authenticated/service_role, auth.users, auth.uid() e privilégios por omissão).
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface QueryResult<Row> {
  rows: Row[];
  affectedRows: number;
  error: string | null;
  code: string | null;
}

interface PostgresError {
  message: string;
  code?: string;
}

function isPostgresError(value: unknown): value is PostgresError {
  return typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string';
}

function toFailure<Row>(error: unknown): QueryResult<Row> {
  if (isPostgresError(error)) return { rows: [], affectedRows: 0, error: error.message, code: error.code ?? null };
  return { rows: [], affectedRows: 0, error: String(error), code: null };
}

const SUPABASE_STUB = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL);
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  -- Subconjunto do Supabase Storage usado pelas migrations (buckets e objetos com RLS ativa).
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, public BOOLEAN NOT NULL DEFAULT false,
    file_size_limit BIGINT, allowed_mime_types TEXT[], created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE storage.objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT REFERENCES storage.buckets(id),
    name TEXT NOT NULL, owner UUID DEFAULT auth.uid(), metadata JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (bucket_id, name)
  );
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
  GRANT ALL ON storage.objects TO anon, authenticated, service_role;
  GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
`;

export class TestDatabase {
  private constructor(private readonly db: PGlite) {}

  /** Cria a base de dados e aplica todas as migrations por ordem. */
  static async create(migrationsDir: string): Promise<TestDatabase> {
    const db = new PGlite();
    await db.exec(SUPABASE_STUB);
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      try {
        await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
      } catch (error) {
        throw new Error(`Falha ao aplicar ${file}: ${isPostgresError(error) ? error.message : String(error)}`);
      }
    }
    return new TestDatabase(db);
  }

  /** Executa como o SQL Editor (role postgres, sem utilizador autenticado). */
  async asPostgres<Row = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<Row>> {
    try {
      const result = await this.db.query<Row>(sql, params);
      return { rows: result.rows, affectedRows: result.affectedRows ?? 0, error: null, code: null };
    } catch (error) {
      return toFailure<Row>(error);
    }
  }

  /** Executa como um pedido PostgREST autenticado (role authenticated + JWT com sub). */
  async asUser<Row = Record<string, unknown>>(authUserId: string, sql: string, params: unknown[] = []): Promise<QueryResult<Row>> {
    await this.db.exec('BEGIN');
    try {
      await this.db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [authUserId]);
      await this.db.exec('SET LOCAL ROLE authenticated');
      const result = await this.db.query<Row>(sql, params);
      await this.db.exec('COMMIT');
      return { rows: result.rows, affectedRows: result.affectedRows ?? 0, error: null, code: null };
    } catch (error) {
      await this.db.exec('ROLLBACK');
      return toFailure<Row>(error);
    }
  }

  async asAnonymous<Row = Record<string, unknown>>(sql: string): Promise<QueryResult<Row>> {
    await this.db.exec('BEGIN');
    try {
      await this.db.exec('SET LOCAL ROLE anon');
      const result = await this.db.query<Row>(sql);
      await this.db.exec('COMMIT');
      return { rows: result.rows, affectedRows: result.affectedRows ?? 0, error: null, code: null };
    } catch (error) {
      await this.db.exec('ROLLBACK');
      return toFailure<Row>(error);
    }
  }

  async createAuthUser(email: string): Promise<string> {
    const { rows } = await this.db.query<{ id: string }>('INSERT INTO auth.users (email) VALUES ($1) RETURNING id', [email]);
    return rows[0].id;
  }

  async scalar<Value>(sql: string, params: unknown[] = []): Promise<Value> {
    const { rows } = await this.db.query<{ value: Value }>(sql, params);
    return rows[0].value;
  }

  async departmentId(code: string): Promise<string> {
    return this.scalar<string>('SELECT id AS value FROM public.departments WHERE code = $1', [code]);
  }

  /** Cria conta Auth + perfil através de create_user_profile, como o faria um administrador. */
  async createUser(adminAuthId: string, email: string, name: string, roleCode: string, departmentCode: string): Promise<TestUser> {
    const authId = await this.createAuthUser(email);
    const result = await this.asUser<{ id: string }>(
      adminAuthId,
      'SELECT public.create_user_profile($1, $2, $3, $4, $5) AS id',
      [authId, name, email, roleCode, await this.departmentId(departmentCode)]
    );
    if (result.error) throw new Error(`Falha ao criar ${email}: ${result.error}`);
    return { authId, profileId: result.rows[0].id };
  }

  /** Convida e configura o primeiro administrador (como no SQL Editor). */
  async bootstrapAdmin(email: string, name: string): Promise<TestUser> {
    const authId = await this.createAuthUser(email);
    const result = await this.asPostgres<{ id: string }>('SELECT public.bootstrap_first_admin($1, $2) AS id', [email, name]);
    if (result.error) throw new Error(`Falha ao configurar o administrador: ${result.error}`);
    return { authId, profileId: result.rows[0].id };
  }

  async countAudit(action: string): Promise<number> {
    return this.scalar<number>('SELECT count(*)::int AS value FROM public.audit_events WHERE action = $1', [action]);
  }
}

export interface TestUser {
  authId: string;
  profileId: string;
}

export class TestReport {
  private passed = 0;
  private failed = 0;

  section(title: string): void {
    console.log(`\n${title}`);
  }

  check(condition: boolean, label: string): void {
    if (condition) {
      this.passed += 1;
      console.log(`  ✓ ${label}`);
    } else {
      this.failed += 1;
      console.log(`  ✗ ${label}`);
    }
  }

  finish(): never {
    console.log(`\n${this.passed} passaram, ${this.failed} falharam`);
    process.exit(this.failed === 0 ? 0 : 1);
  }
}
