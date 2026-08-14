import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setPassword() {
  const { error } = await supabase.auth.admin.updateUserById(
    'e0bf99b8-b318-4f14-ac0b-b0de8287b294',
    {
      password: '123456' 
    }
  );

  if (error) {
    console.error('❌ ERRO:', error.message);
  } else {
    console.log('✅ SENHA DEFINIDA COM SUCESSO');
  }
}

setPassword();
