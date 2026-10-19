// supabase/functions/auth-token/index.ts
// Принимает: { username, password }
// Возвращает: { access_token, expires_in }
//
// ВАЖНО: Эта версия НЕ проверяет пароль внутри Edge Function (нет Argon2id в Deno).
// Она доверяет username, пришедшему с клиента. Это упрощение для разработки.
// В проде — перенесите проверку пароля в Edge Function.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SignJWT, importPKCS8 } from 'https://deno.land/x/jose@v5.2.0/index.ts';

const JWT_PRIVATE_KEY = Deno.env.get('JWT_PRIVATE_KEY')!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { username } = await req.json();

        if (!username) {
            return new Response(
                JSON.stringify({ error: 'username обязателен' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const privateKey = await importPKCS8(JWT_PRIVATE_KEY, 'RS256');

        const now = Math.floor(Date.now() / 1000);
        const expiresIn = 3600; // 1 час

        const token = await new SignJWT({
            sub: username,
            role: 'authenticated',
            aud: 'authenticated',
        })
            .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
            .setIssuedAt(now)
            .setExpirationTime(now + expiresIn)
            .setIssuer('purple-3000')
            .sign(privateKey);

        return new Response(
            JSON.stringify({
                access_token: token,
                expires_in: expiresIn,
                token_type: 'Bearer'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('auth-token error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});