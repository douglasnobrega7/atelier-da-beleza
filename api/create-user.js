import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const { email, password, name, salon_id, role } = req.body
    const normalizedEmail = email?.trim().toLowerCase()
    const normalizedRole = role === 'caixa' || role === 'cashier' ? 'caixa' : 'profissional'

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'Variáveis Supabase não configuradas' })
    }

    if (!normalizedEmail || !password || !name || !salon_id) {
      return res.status(400).json({ error: 'Informe e-mail, senha, nome e salão' })
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // 🔥 cria usuário no AUTH
    const { data: userData, error: authError } =
      await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true
      })

    if (authError) {
      console.error('Erro AUTH:', authError)
      return res.status(400).json({ error: authError.message })
    }

    if (!userData?.user?.id) {
      return res.status(500).json({ error: 'Auth não retornou usuário criado' })
    }

    // 🔥 salva no banco
    const { error: dbError } = await supabase.from('users').insert({
      id: userData.user.id,
      email: normalizedEmail,
      name,
      role: normalizedRole,
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
