import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const { email, password, name, salon_id } = req.body

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // 🔥 CRIA USUÁRIO NO AUTH DIRETO
    const { data: userData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      })

    if (authError) {
      console.error('Erro AUTH:', authError)
      return res.status(400).json({ error: authError.message })
    }

    // 🔥 SALVA NO BANCO
    const { error: dbError } = await supabase.from('users').insert({
      id: userData.user.id,
      email,
      name,
      role: 'employee',
      salon_id
    })

    if (dbError) {
      console.error('Erro DB:', dbError)
      return res.status(400).json({ error: dbError.message })
    }

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('Erro geral:', err)
    return res.status(500).json({ error: err.message })
  }
}