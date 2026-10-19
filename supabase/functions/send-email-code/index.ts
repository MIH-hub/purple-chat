// supabase/functions/send-email-code/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SMTP_USER = Deno.env.get('SMTP_USER')!;
const SMTP_PASS = Deno.env.get('SMTP_PASS')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { username, email } = await req.json();

        if (!username || !email) {
            return new Response(
                JSON.stringify({ error: 'username и email обязательны' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        await supabase.from('email_verifications').delete().eq('username', username);
        const { error: dbError } = await supabase
            .from('email_verifications')
            .insert({ username, email, code, expires_at: expiresAt });

        if (dbError) throw dbError;

        const client = new SMTPClient({
            connection: {
                hostname: 'smtp.gmail.com',
                port: 465,
                tls: true,
                auth: { username: SMTP_USER, password: SMTP_PASS },
            },
        });

        await client.send({
            from: `Purple 3000 <${SMTP_USER}>`,
            to: email,
            subject: 'Код подтверждения — Purple 3000',
            content: `Ваш код: ${code}\n\nКод действителен 10 минут.`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                    <h2 style="color:#9D4EDD;">Purple 3000</h2>
                    <p>Ваш код подтверждения:</p>
                    <h1 style="font-size:42px;letter-spacing:8px;color:#9D4EDD;text-align:center;padding:20px;background:#f5f5f5;border-radius:8px;">
                        ${code}
                    </h1>
                    <p style="color:#666;">Код действителен 10 минут.</p>
                </div>
            `,
        });

        await client.close();

        return new Response(
            JSON.stringify({ success: true, message: 'Код отправлен' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('send-email-code error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});