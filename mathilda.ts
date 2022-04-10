import { Application, Router, Status } from 'https://deno.land/x/oak@v10.5.1/mod.ts'
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.22-alpha/deno-dom-wasm.ts';

let cache: Map<string, string> = new Map()

async function cfetch(url: string): Promise<string> {
  if (cache.has(url)) {
    return cache.get(url) ?? ''
  } else {
    let text = await (await fetch(url)).text()
    cache.set(url, text)
    return text
  }
}

const router = new Router()

router.get("/", (ctx) => {
  ctx.response.body = {
    message: 'Mathilda Scraper for https://wishlily.app/',
    success: true,
  }
})

router.get("/etsy/search", async (ctx) => {
  try {
    const query = ctx.request.url.searchParams.get('q')
    const results = await cfetch(`https://etsy.com/search?q=${query}`)
    const document: any = new DOMParser().parseFromString(results, 'text/html');
    const links = document.getElementsByClassName('v2-listing-card')

    let resultsJSON = []
    for (let link of links) {
      const productinfo = link.getElementsByClassName("v2-listing-card__info")[0]
      let title = productinfo.getElementsByClassName('v2-listing-card__title')[0].textContent.replace('\\n', '').trim()
      let cover = link.getElementsByClassName('wt-width-full')[0].outerHTML.match(/src="(.*?)"/)[1]
      let price = productinfo.getElementsByClassName("currency-symbol")[0].textContent + productinfo.getElementsByClassName("currency-value")[0].textContent
      let buyLink = link.outerHTML.match(/href="(.*?)"/)[1]

      resultsJSON.push({
        title,
        price,
        cover,
        link: buyLink,
      })
    }

    ctx.response.body = {
      message: resultsJSON,
      success: true,
    }
  } catch (e) {
    console.log(e)
    ctx.response.body = {
      message: 'Internal error occurred.',
      success: false,
    }
    ctx.response.status = Status.InternalServerError
  }
})

const app = new Application()
app.use(router.routes())
app.use(router.allowedMethods())

app.addEventListener(
  "listen",
  (e) => console.log('Listening on http://localhost:8080'),
)
await app.listen({ port: 8080 })
