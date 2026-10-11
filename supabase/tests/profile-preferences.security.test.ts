// Testes do perfil pessoal: nome de apresentação e preferências de idioma e tema.
// Executar com: npm run test:db
import { join } from 'node:path';
import { TestDatabase, TestReport } from './harness';

const db = await TestDatabase.create(join(import.meta.dirname, '..', 'migrations'));
const report = new TestReport();
const check = report.check.bind(report);

const admin = await db.bootstrapAdmin('admin@siholdings-mz.com', 'Administrador');
const gestor = await db.createUser(admin.authId, 'gestor.ops@siholdings-mz.com', 'Gil Gestor Operações', 'GESTOR', 'OPS');
const ana = await db.createUser(admin.authId, 'ana@siholdings-mz.com', 'Ana Operações', 'EMPLOYEE', 'OPS');
const rui = await db.createUser(admin.authId, 'rui@siholdings-mz.com', 'Rui Operações', 'EMPLOYEE', 'OPS');
await db.asUser(admin.authId, 'INSERT INTO public.manager_scopes (manager_id, department_id) VALUES ($1, $2)', [gestor.profileId, await db.departmentId('OPS')]);

type Preferences = { display_name: string | null; preferred_language: string | null; theme_preference: string | null };
const preferencesOf = async (profileId: string) =>
  (await db.asPostgres<Preferences>('SELECT display_name, preferred_language, theme_preference FROM public.profiles WHERE id = $1', [profileId])).rows[0];
const update = (authId: string, profileId: string, assignments: string) =>
  db.asUser(authId, `UPDATE public.profiles SET ${assignments} WHERE id = $1`, [profileId]);

// =============================================================================
report.section('Valores iniciais');
const initial = await preferencesOf(ana.profileId);
check(
  initial?.display_name === null && initial?.preferred_language === null && initial?.theme_preference === null,
  'perfis existentes ficam sem preferências (a aplicação usa português e o tema do sistema)'
);

// =============================================================================
report.section('Preferências do próprio');
check(!(await update(ana.authId, ana.profileId, "preferred_language = 'en', theme_preference = 'dark'")).error, 'a pessoa escolhe idioma e tema');
const chosen = await preferencesOf(ana.profileId);
check(chosen?.preferred_language === 'en' && chosen?.theme_preference === 'dark', 'as preferências ficam guardadas');
check(!(await update(ana.authId, ana.profileId, "theme_preference = 'system'")).error, 'pode voltar ao tema do sistema');
check((await update(ana.authId, ana.profileId, "preferred_language = 'fr'")).code === '23514', 'idioma fora de pt/en é recusado');
check((await update(ana.authId, ana.profileId, "theme_preference = 'azul'")).code === '23514', 'tema desconhecido é recusado');
check((await update(rui.authId, ana.profileId, "preferred_language = 'pt'")).affectedRows === 0, 'colega não altera as preferências de outra pessoa');
check((await update(admin.authId, ana.profileId, "theme_preference = 'light'")).code === '42501', 'nem a administração altera as preferências de outra pessoa');
check((await update(gestor.authId, ana.profileId, "preferred_language = 'pt'")).affectedRows === 0, 'gestor não altera as preferências da equipa');
check((await preferencesOf(ana.profileId))?.theme_preference === 'system', 'as tentativas recusadas não mudam nada');

// =============================================================================
report.section('Nome de apresentação');
check(!(await update(ana.authId, ana.profileId, "display_name = '  Aninha  '")).error, 'a pessoa define o próprio nome de apresentação');
check((await preferencesOf(ana.profileId))?.display_name === 'Aninha', 'espaços à volta são retirados');
check(!(await update(ana.authId, ana.profileId, "display_name = '   '")).error, 'nome só com espaços é aceite como limpar');
check((await preferencesOf(ana.profileId))?.display_name === null, 'nome em branco fica vazio (usa o nome completo)');
check((await update(ana.authId, ana.profileId, "display_name = 'A'")).code === '23514', 'nome com menos de 2 carateres é recusado');
check(!(await update(admin.authId, ana.profileId, "display_name = 'Ana O.'")).error, 'a administração corrige o nome de apresentação');
check((await preferencesOf(ana.profileId))?.display_name === 'Ana O.', 'a correção da administração fica guardada');
check(
  (await update(rui.authId, ana.profileId, "display_name = 'Outra'")).affectedRows === 0 && (await preferencesOf(ana.profileId))?.display_name === 'Ana O.',
  'colega não altera o nome de apresentação de outra pessoa'
);
check((await update(gestor.authId, ana.profileId, "display_name = 'Outra'")).affectedRows === 0, 'gestor não altera o nome de apresentação da equipa');
check((await preferencesOf(ana.profileId))?.preferred_language === 'en', 'alterar o nome não mexe nas preferências');

// =============================================================================
report.section('Função do trigger');
check(
  (await db.asUser(ana.authId, 'SELECT public.guard_profile_preferences()')).code === '42501',
  'a função do trigger não é chamável pela API'
);

report.finish();
