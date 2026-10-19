// supabase/functions/jwks/index.ts
// Отдаёт публичный ключ в формате JWKS для проверки JWT

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { importSPKI, exportJWK } from 'https://deno.land/x/jose@v5.2.0/index.ts';

const JWT_PUBLIC_KEY = Deno.env.get('JWT_PUBLIC_KEY')!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // ВАЖНО: extractable: true — иначе exportJWK не сможет экспортировать ключ
        const publicKey = await importSPKI(JWT_PUBLIC_KEY, 'RS256', { extractable: true });
        const jwk = await exportJWK(publicKey);

        const jwks = {
            keys: [
                {
                    ...jwk,
                    kid: 'purple-3000-key-1',
                    alg: 'RS256',
                    use: 'sig'
                }
            ]
        };

        return new Response(
            JSON.stringify(jwks),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('jwks error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});