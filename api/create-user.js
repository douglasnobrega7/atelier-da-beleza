import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const { email, password, name, salon_id } = req.body || {}

    if (!email || !password || !name || !salon_id) {
      return res.status(400).json({
        error: 'Dados obrigatórios ausentes',
        details: { email, hasPassword: !!password, name, salon_id }
      })
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: 'Variáveis do Supabase não configuradas no Vercel'
      })
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const normalizedEmail = String(email).trim().toLowerCase()
    const normalizedName = String(name).trim()

    // Verifica se já existe usuário com esse e-mail no Auth
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('AUTH LIST ERROR:', listError)
      return res.status(400).json({
        error: 'Erro ao verificar usuário existente',
        details: listError
      })
    }

    const existingUser = listData?.users?.find(
      (user) => user.email?.toLowerCase() === normalizedEmail
    )

    let authUserId

    if (existingUser) {
      authUserId = existingUser.id
    } else {
      const { data: userData, error: authError } =
        await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password,
          email_confirm: true,
          user_metadata: {
            name: normalizedName,
            role: 'employee',
            salon_id
          }
        })

      if (authError) {
        console.error('AUTH CREATE ERROR:', authError)
        return res.status(400).json({
          error: 'Erro ao criar usuário no Auth',
          details: authError
        })
      }

      authUserId = userData.user.id
    }

    // Cria ou atualiza o perfil na tabela users
    const { error: dbError } = await supabase
      .from('users')
      .upsert(
        {
          id: authUserId,
          email: normalizedEmail,
          name: normalizedName,
          role: 'employee',
          salon_id
        },
        { onConflict: 'id' }
      )

    if (dbError) {
      console.error('DB UPSERT ERROR:', dbError)
      return res.status(400).json({
        error: 'Erro ao criar perfil na tabela users',
        details: dbError
      })
    }

    return res.status(200).json({
      success: true,
      user_id: authUserId,
      email: normalizedEmail,
      existed: !!existingUser
    })

  } catch (err) {
    console.error('API CREATE USER ERROR:', err)
    return res.status(500).json({
      error: 'Erro interno na API',
      details: err?.message || String(err)
    })
  }
}