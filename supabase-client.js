/* Client do Supabase — instância self-hosted da Advocacia de Impacto.
   ------------------------------------------------------------------
   Sem build, então o supabase-js vem de um CDN (esm.sh), como um
   módulo ES normal. Nada disso é segredo: a chave abaixo é a `anon`,
   feita para ficar pública no navegador — o que decide o que ela pode
   ler/escrever são as políticas de RLS em supabase-schema.sql, não
   esconder esta chave.

   Atenção, item separado: esta é a chave de DEMONSTRAÇÃO pública do
   Supabase self-hosted (o "iss" dela é "supabase-demo" — mesma chave
   documentada no repositório oficial). Se o JWT_SECRET desta instância
   ainda for o padrão de exemplo, qualquer pessoa consegue forjar um
   token `service_role` válido e ignorar todo o RLS. Trocar o
   JWT_SECRET no servidor (e gerar chaves novas a partir dele) é
   pendente — ver a seção de segurança no README.
   ------------------------------------------------------------------ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const URL = 'https://supabase.advocaciadeimpacto.adv.br';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';

export const supabase = createClient(URL, ANON_KEY);
