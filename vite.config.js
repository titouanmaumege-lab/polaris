import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Sert les fonctions de api/ pendant `npm run dev`, pour ne pas avoir besoin de
// `vercel dev`. En production, Vercel les sert lui-même — ce plugin n'existe pas.
function apiDevServer(env) {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const name = req.url.split('?')[0].slice('/api/'.length)
        if (!/^[a-z0-9-]+$/i.test(name)) return next()
        Object.assign(process.env, env) // ANTHROPIC_API_KEY & co. depuis .env
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          const chunks = []
          for await (const c of req) chunks.push(c)
          req.body = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''
          res.status = code => { res.statusCode = code; return res }
          res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
          await mod.default(req, res)
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'dev_handler_failed', detail: String(e?.message || e) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), apiDevServer(env)] }
})
