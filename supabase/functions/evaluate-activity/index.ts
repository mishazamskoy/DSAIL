import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // User-scoped client — only used for auth verification
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Service-role client — bypasses RLS for all DB writes
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { activityText } = await req.json()
    if (!activityText || typeof activityText !== 'string' || activityText.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'activityText is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Call Anthropic API directly via fetch to avoid SDK version drift issues
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 300,
        system: `You are a strict health and wellness evaluator for a medieval city-building game. Players earn three types of building resources ONLY for behaviours that genuinely promote health and wellbeing.

RESOURCES (each scored 0–20 per entry):
- food_points: Awarded for healthy eating — nutritious home-cooked meals, balanced diet, fruits and vegetables, proper hydration. Award 0 for junk food, fast food, fried food, candy, sugary drinks, or excessive alcohol.
- knowledge_points: Awarded for mental wellness — reading, learning, studying, meditation, journaling, gratitude practice, quality sleep habits, therapy, meaningful social connection, acts of kindness.
- wood_points: Awarded for physical activity — exercise, sport, strength training, running, cycling, hiking, yoga, swimming, outdoor activity, any deliberate movement.

ZERO POINTS in all categories for:
- Unhealthy food (junk, fried, fast food, candy, soda, excessive alcohol)
- Sedentary behaviour (watching TV, lying on the couch, gaming for hours, scrolling phone)
- Neutral daily tasks (commuting, housework, shopping, ordinary desk work)
- Anything harmful or that undermines health

SCORING RUBRIC (for genuinely healthy activities only):
- Minor healthy choice (glass of water, 10-min walk, short stretch): 1–5 pts
- Moderate activity (balanced meal, 30-min yoga, 30-min read, focused study session): 6–12 pts
- Strong activity (10km run, cooked nutritious meal from scratch, 1-hr meditation, intensive study): 13–20 pts

Mixed entries: only score the healthy parts. A meal of salad AND fried chicken earns food_points only for the salad portion.

Respond ONLY with valid JSON (no markdown, no extra text):
{"food_points": 0, "knowledge_points": 0, "wood_points": 0, "message": "Brief honest message — acknowledge what was rewarded and, if nothing was rewarded for something unhealthy, gently note why"}`,
        messages: [{ role: 'user', content: activityText.trim() }],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      console.error('Anthropic API error:', anthropicRes.status, errText)
      throw new Error(`Anthropic API error: ${anthropicRes.status}`)
    }

    const anthropicData = await anthropicRes.json()
    const text = anthropicData.content?.[0]?.type === 'text' ? anthropicData.content[0].text : ''

    let award: {
      food_points: number
      knowledge_points: number
      wood_points: number
      message: string
    }
    try {
      award = JSON.parse(text)
    } catch {
      award = { food_points: 0, knowledge_points: 0, wood_points: 0, message: 'Could not evaluate activity.' }
    }

    // Clamp all values to [0, 20]
    const clamp = (n: number) => Math.max(0, Math.min(20, Math.round(n ?? 0)))
    award.food_points      = clamp(award.food_points)
    award.knowledge_points = clamp(award.knowledge_points)
    award.wood_points      = clamp(award.wood_points)
    const earned = award.food_points + award.knowledge_points + award.wood_points

    // Always log the activity
    const { error: logError } = await supabase.from('activity_logs').insert({
      user_id:           user.id,
      activity_text:     activityText.trim(),
      food_points:       award.food_points,
      knowledge_points:  award.knowledge_points,
      wood_points:       award.wood_points,
      total_points:      earned,
      // city-metric columns — always 0, derived from structures not activities
      grain_points:      0,
      happiness_points:  0,
      population_points: 0,
      money_points:      0,
    })
    if (logError) console.error('activity_logs insert error:', logError)

    if (earned > 0) {
      // Atomic upsert: inserts a new user_data row or increments existing one.
      // award_activity_points uses INSERT … ON CONFLICT DO UPDATE so it
      // handles both cases in a single statement — no two-step race condition.
      const { error: awardError } = await supabase.rpc('award_activity_points', {
        p_user_id:   user.id,
        p_food:      award.food_points,
        p_knowledge: award.knowledge_points,
        p_wood:      award.wood_points,
        p_total:     earned,
      })
      if (awardError) console.error('award_activity_points error:', awardError)
    }

    return new Response(
      JSON.stringify({ ...award, total_earned: earned }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
