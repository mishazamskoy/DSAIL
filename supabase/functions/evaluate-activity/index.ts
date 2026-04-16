import Anthropic from 'npm:@anthropic-ai/sdk'
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
    // Verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { activityText } = await req.json()
    if (!activityText || typeof activityText !== 'string' || activityText.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'activityText is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Call Claude to evaluate the activity
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 256,
      system: `You are a health and wellness evaluator for a city-building game. Players earn resources by doing healthy activities and eating well. Evaluate the submitted activity/food entry and award points in three categories:

- food_points: awarded for healthy eating, cooking, nutrition habits (0-20 per entry)
- knowledge_points: awarded for mental wellness, learning, meditation, reading, journaling (0-20 per entry)
- wood_points: awarded for physical activity, exercise, movement, outdoor activities (0-20 per entry)

Rules:
- Only award points for genuinely health-positive activities. Unhealthy activities (junk food, sedentary habits, etc.) earn 0 points.
- Be generous but fair — even small healthy choices should earn some points.
- A single strong activity can earn up to 20 points in its primary category.
- Multiple relevant categories can each earn points for the same entry.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{"food_points": 0, "knowledge_points": 0, "wood_points": 0, "message": "Brief encouraging message about what was rewarded and why"}`,
      messages: [
        { role: 'user', content: activityText.trim() }
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    let award: { food_points: number; knowledge_points: number; wood_points: number; message: string }
    try {
      award = JSON.parse(text)
    } catch {
      award = { food_points: 0, knowledge_points: 0, wood_points: 0, message: 'Could not evaluate activity.' }
    }

    // Clamp values
    award.food_points = Math.max(0, Math.min(20, Math.round(award.food_points ?? 0)))
    award.knowledge_points = Math.max(0, Math.min(20, Math.round(award.knowledge_points ?? 0)))
    award.wood_points = Math.max(0, Math.min(20, Math.round(award.wood_points ?? 0)))
    const earned = award.food_points + award.knowledge_points + award.wood_points

    // Always log the activity so the City Advisor can reference history
    await supabase.from('activity_logs').insert({
      user_id:          user.id,
      activity_text:    activityText.trim(),
      food_points:      award.food_points,
      knowledge_points: award.knowledge_points,
      wood_points:      award.wood_points,
      total_points:     earned,
    })

    if (earned > 0) {
      // Upsert user_data row (ensure it exists first), then increment
      await supabase.from('user_data').upsert(
        { user_id: user.id },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )

      await supabase.rpc('increment_points', {
        p_user_id: user.id,
        p_food: award.food_points,
        p_knowledge: award.knowledge_points,
        p_wood: award.wood_points,
        p_total: earned,
      })
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
