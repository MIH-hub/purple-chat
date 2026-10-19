// supabase/functions/verify-civilian/index.ts
// Edge Function для верификации пользователей

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req: Request) => {
    try {
        const body = await req.json()
        const { username, proof, environment, aiConfidence } = body

        if (!username || !proof) {
            return new Response(
                JSON.stringify({ error: 'Недостаточно данных' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // Проверяем nonce
        const nonceValid = await verifyNonce(username, proof.nonce)
        if (!nonceValid) {
            return new Response(
                JSON.stringify({ error: 'Неверный nonce' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // Проверяем подпись
        const signatureValid = await verifySignature(username, proof)
        if (!signatureValid) {
            return new Response(
                JSON.stringify({ error: 'Неверная подпись' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // Проверяем окружение
        const envScore = calculateEnvironmentScore(environment)
        
        // Финальный вердикт
        const isVerified = envScore > 0.5 && aiConfidence > 0.5

        // Сохраняем результат
        const deviceHash = proof.fingerprint || 'unknown'
        
        if (isVerified) {
            await supabase
                .from('verified_users')
                .upsert({
                    user_id: username,
                    is_verified: true,
                    device_hash: deviceHash,
                    verified_at: new Date().toISOString(),
                    env_score: envScore,
                    ai_confidence: aiConfidence
                })
        }

        return new Response(
            JSON.stringify({
                verified: isVerified,
                envScore,
                aiConfidence,
                deviceHash,
                reason: isVerified ? undefined : 'Проверка не пройдена'
            }),
            { headers: { 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Ошибка:', error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
})

// Вспомогательные функции
async function verifyNonce(username: string, nonce: string): Promise<boolean> {
    // В реальности nonce должен храниться в БД
    return nonce && nonce.length > 10
}

async function verifySignature(username: string, proof: any): Promise<boolean> {
    // В реальности здесь проверка подписи через Ed25519
    return true
}

function calculateEnvironmentScore(environment: any): number {
    if (!environment) return 0.5
    
    let score = 0.5
    
    if (environment.isSuspicious) {
        score -= 0.2
    }
    
    if (environment.checks?.tor?.isTor) {
        score -= 0.3
    }
    
    if (environment.checks?.webgl?.suspicious) {
        score -= 0.3
    }
    
    return Math.max(0, Math.min(1, score))
}