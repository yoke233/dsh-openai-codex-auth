import { createServer } from 'node:http'
import axios from 'axios'
import { afterEach, describe, expect, it } from 'vitest'

const originalEnv = {
  HTTP_PROXY: process.env.HTTP_PROXY,
  NO_PROXY: process.env.NO_PROXY,
  NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY,
}

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('HTTP proxy', () => {
  it('uses HTTP_PROXY without NODE_USE_ENV_PROXY', async () => {
    let requestedUrl: string | undefined
    const proxy = createServer((request, response) => {
      requestedUrl = request.url
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"proxied":true}')
    })
    await new Promise<void>((resolve, reject) => {
      proxy.once('error', reject)
      proxy.listen(0, '127.0.0.1', resolve)
    })

    try {
      const address = proxy.address()
      if (address === null || typeof address === 'string') throw new Error('Proxy has no TCP address')
      process.env.HTTP_PROXY = `http://127.0.0.1:${address.port}`
      process.env.NO_PROXY = ''
      delete process.env.NODE_USE_ENV_PROXY

      const response = await axios.get('http://openai.invalid/proxy-check')

      expect(response.data).toEqual({ proxied: true })
      expect(requestedUrl).toBe('http://openai.invalid/proxy-check')
    } finally {
      await new Promise<void>((resolve, reject) => {
        proxy.close(error => { if (error) reject(error); else resolve() })
      })
    }
  })
})
