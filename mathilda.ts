import { Application, Router, Status } from 'https://deno.land/x/oak@v10.5.1/mod.ts'
import { DOMParser, HTMLDocument } from 'https://deno.land/x/deno_dom@v0.1.22-alpha/deno-dom-wasm.ts';
import { CORS } from 'https://deno.land/x/oak_cors@v0.1.0/mod.ts';
import { Html5Entities } from 'https://deno.land/x/html_entities@v1.0/mod.js';

const cache: Map<string, string> = new Map()

function cookieString(cookies: Record<string, string>): string {
  let string = ''
  for (const cookie in cookies) {
    string = `${string}${cookie}=${cookies[cookie]}; `
  }
  string = string.slice(0, string.length - 2)
  return string
}

async function cfetch(url: string, lang: string): Promise<string> {
  if (cache.has(lang + url)) {
    return cache.get(lang + url) ?? ''
  } else {
    let it: Response | undefined
    let newURL = url
    const cookie: Record<string, string> = {}
    let tries = 0
    console.log('[ ] Starting request')
    while ((it === undefined || (it.headers.has('set-cookie') && cookie === {}) || (it.headers.has('location')) || it.status === 301 || it.status === 302) && tries < 30) {
      it = (await fetch(
        newURL,
        {
          headers: {
            'accept-language': lang,
            'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="101", "Google Chrome";v="101"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-site': 'none',
            'sec-fetch-user': '?1',
            'sec-gpc': '1',
            'upgrade-insecure-requests': '1',
            'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Mobile Safari/537.36',
            'cache-control': 'no-cache',
            'accept': 'text/html',
            'cookie': cookieString(cookie)
          },
          redirect: 'manual'
        }
      ))
      const loc = it.headers.get('location')
      if ((it.status === 301 || it.status === 302) && loc) {
        console.log(` |  Redirected to "${loc}"`)
        newURL = loc
      }
      const cookies = it.headers.get('set-cookie')?.split('; ')
      if (cookies) {
        for (const eachCookie of cookies) {
          if (eachCookie.includes('=')) {
            const newCookie = eachCookie?.split('=')
            if (newCookie[0] !== undefined && newCookie[1] !== undefined && !['path','expires', 'Path', 'Expires', '', ' '].includes(newCookie[0])) {
              if (newCookie) {
                cookie[newCookie[0]] = newCookie[1]
                console.log(` |  Cookie "${newCookie[0]}" set to "${newCookie[1]}"`)
              }
            }
          }
        }
      }
      tries++;
    }
    if (tries === 30) {
      console.log(`[ ] Bailed!`)
    } else {
      console.log(`[1] Finished fetcing from server`)
    }
    if (it === undefined) throw new Error('Bail - unable to handle URL shenanigans')
    const text = await it.text()
    cache.set(lang + url, text)
    return text
  }
}

function getMeta(document: HTMLDocument, name: string) : string | undefined {
  const byName = document.querySelector(`meta[name=\'${name}\']`)?.outerHTML.match(/content=\\?"(.*?)\\?"/)?.[1]
  const byProperty = document.querySelector(`meta[property=\'${name}\']`)?.outerHTML.match(/content=\\?"(.*?)\\?"/)?.[1]
  return byName ?? byProperty
}

const router = new Router()

router.get('/', (ctx) => {
  ctx.response.body = {
    message: 'Chrome simulation server & web scraper for https://wishlily.app/',
    success: true,
  }
})

router.get('/generic/product', async (ctx) => {
  let id: string | undefined
  try {
    const lang = ctx.request.headers.get('Accept-Language')
    const idp = ctx.request.url.searchParams.get('id')
    id = idp ? decodeURIComponent(idp) : undefined
    if (id?.includes('proxy.wishlily.app') || id?.includes('deno.dev')) throw new Error('Infinite proxy loop!')

    if (id?.includes('amazon.com')) {
      id = `https://amazon.com/dp${id.match(/.*?h?t?t?p?s?:?\/?\/?w?w?w?.?amazon\.com\/?.*?\/(?:dp|gp)\/?a?w?\/?d?(\/[0-9A-Z]{10}).*/)?.[1]}`
    }

    const results = await cfetch(`${id}`, lang ?? 'en-US,en;q=0.5')
    const tempDocument = new DOMParser().parseFromString(results, 'text/html');
    if (tempDocument === null) throw new Error('Cannot load website.')
    const document: HTMLDocument = tempDocument
    const cover = getMeta(document, 'og:image') ?? getMeta(document, 'twitter:image:src')
    const title = getMeta(document, 'title') ?? getMeta(document, 'og:title') ?? getMeta(document, 'twitter:title')
    const ogPrice = (getMeta(document, 'og:price:currency') == 'USD' ? `$${getMeta(document, 'og:price:amount')}` : undefined)
    const regexPrices = results.match(/\$[\n\\n\s\t]*?([0-9]?[0-9]?[0-9]?[0-9]?[0-9]?[0-9]\.?[0-9][0-9])/g) ?? []
    let regexPrice
    console.log(regexPrices)
    for (const thep of regexPrices) {
      const thep2 = thep.replace('$', '').replace('\\', '').replace('n', '').replace('\n', '').replace(' ', '')
      if (regexPrice === undefined && thep2 !== '0.00') {
        regexPrice = thep2
      }
    }
    const price = (ogPrice === undefined || ogPrice === '$0.00') && (regexPrice !== undefined && regexPrice !== '$0.00') ? `$${regexPrice}` : ogPrice

    ctx.response.body = {
      isSearch: false,
      title: title ? Html5Entities.decode(title) : undefined,
      price: price === '$0.00' ? undefined : price,
      cover,
      link: id?.toString() ?? 'https://wishlily.app/',
      success: true,
    }
  } catch (e) {
    console.log(e)
    ctx.response.body = {
      message: e.message ?? 'Internal error occurred.',
      success: false,
      id
    }
    ctx.response.status = Status.InternalServerError
  }
})

const app = new Application()
app.use(CORS())
app.use(router.routes())
app.use(router.allowedMethods())

app.addEventListener(
  'listen',
  (_) => console.log('Listening on http://localhost:8080'),
)
await app.listen({ port: 8080 })
