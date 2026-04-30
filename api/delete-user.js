import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' })
  }

  try {
    const { user_id, email } = req.body ?? {}
    const normalizedUserId = user_id?.trim()
    const normalizedEmail = email?.trim().toLowerCase()

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Variaveis Supabase nao configuradas' })
    }

    if (!normalizedUserId && !normalizedEmail) {
      return res.status(400).json({ error: 'Informe user_id ou email' })
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    if (normalizedUserId) {
      const { error: authError } = await supabase.auth.admin.deleteUser(normalizedUserId)

      if (authError) {
        console.error('Erro AUTH delete-user:', authError)
        return res.status(400).json({ error: authError.message })
      }
    }

    const query = supabase.from('users').delete()
    const { error: dbError } = normalizedUserId
      ? await query.eq('id', normalizedUserId)
      : await query.eq('email', normalizedEmail)

    if (dbError) {
      console.error('Erro DB delete-user:', dbError)
      return res.status(400).json({ error: dbError.message })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Erro geral delete-user:', err)
    return res.status(500).json({ error: err.message })
  }
}
