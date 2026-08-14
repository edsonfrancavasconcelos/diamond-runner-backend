import dotenv from 'dotenv';
import { supabase } from '../src/services/supabase';

dotenv.config();

async function main() {
  try {
    const email = process.argv[2] || 'dr1000@dev.local';
    const password = process.argv[3] || '123456';
    const idDr = 'DR1000';
    const fullName = 'Dev Runner DR1000';

    console.log('Criando usuário de desenvolvimento:', email);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        id_dr: idDr,
      },
    });

    if (authError || !authData?.user) {
      console.error('Falha ao criar usuário:', authError || authData);
      process.exit(1);
    }

    const userId = authData.user.id;

    const { error: profileError } = await supabase.from('profiles').insert([
      {
        id: userId,
        full_name: fullName,
        email,
        id_dr: idDr,
        sponsor_id: null,
        country: 'BR',
        is_active: true,
        level: 1,
        created_at: new Date().toISOString(),
      },
    ]);

    if (profileError) {
      console.error('Erro ao inserir profile, removendo usuário criado...', profileError);
      await supabase.auth.admin.deleteUser(userId);
      process.exit(1);
    }

    console.log('Usuário criado com sucesso:', { email, password, idDr, userId });
    process.exit(0);
  } catch (err: any) {
    console.error('Erro inesperado:', err.message || err);
    process.exit(1);
  }
}

main();
