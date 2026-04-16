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

    const { question } = await req.json().catch(() => ({ question: '' }))

    // Fetch the last 40 activity logs (most recent first)
    const { data: logs } = await supabase
      .from('activity_logs')
      .select('activity_text, food_points, knowledge_points, wood_points, total_points, logged_at')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(40)

    // Build a human-readable history string
    let historyText: string
    if (!logs || logs.length === 0) {
      historyText = 'The player has not logged any activities yet.'
    } else {
      historyText = logs.map((l) => {
        const date = new Date(l.logged_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        })
        const earned: string[] = []
        if (l.food_points      > 0) earned.push(`+${l.food_points} food`)
        if (l.knowledge_points > 0) earned.push(`+${l.knowledge_points} knowledge`)
        if (l.wood_points      > 0) earned.push(`+${l.wood_points} wood`)
        const pts = earned.length > 0 ? ` → earned ${earned.join(', ')}` : ' → no points awarded'
        return `• ${date}: "${l.activity_text}"${pts}`
      }).join('\n')
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

    const userMessage = question?.trim()
      ? `My activity history:\n${historyText}\n\nMy question: ${question.trim()}`
      : `My activity history:\n${historyText}\n\nPlease give me a personalised tip for today.`

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 400,
      system: `You are the City Advisor — a wise, warm, and encouraging guide in a city-building wellness game. The player earns resources (food, knowledge, wood) by doing healthy activities and eating well, then uses those resources to build their city.

Your role: review the player's activity history and give them one specific, personalised suggestion for today. Follow these rules:

1. Reference their ACTUAL past activities when relevant (e.g. "You haven't gone for a run since April 3rd").
2. If they're new with no history, give a friendly beginner-friendly suggestion.
3. Suggest either: (a) something they haven't done in a while, or (b) a new healthy activity or meal that fits their lifestyle based on what you know.
4. Mention which resource type the suggestion earns (food / knowledge / wood).
5. Keep the response to 3–5 sentences. Be specific, not generic. Sound like a wise friend, not a health app.
6. Do NOT list multiple suggestions — just one great one.`,
      messages: [{ role: 'user', content: userMessage }],
    })

    const advice = response.content[0].type === 'text'
      ? response.content[0].text
      : 'Your city awaits your counsel, but I could not divine advice at this moment.'

    return new Response(
      JSON.stringify({ advice }),
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
