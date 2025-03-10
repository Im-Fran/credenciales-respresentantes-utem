import { Hono } from 'hono'
import {JWT} from "google-auth-library"
import {GoogleSpreadsheet, GoogleSpreadsheetWorksheet} from "google-spreadsheet";
import {TsGoogleDrive} from "ts-google-drive";

const app = new Hono()
const jwt = new JWT({
  email: process.env.GS_CLIENT_EMAIL,
  key: process.env.GS_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
});
const sheets = new GoogleSpreadsheet(process.env.SHEETS_ID || '', jwt)
const tsGoogleDrive = new TsGoogleDrive({credentials: {
    client_email: process.env.GS_CLIENT_EMAIL,
    private_key: process.env.GS_PRIVATE_KEY
  }});
let lastLoad = 0

app.get('/', (c) => c.text('Por favor visita /info/:correo para obtener los datos'))

app.get('/info/:correo', async (c) => {
  const {correo} = c.req.param()

  if(lastLoad === 0 || ((Date.now() - lastLoad) > (1000 * 60 * 5))) {
    await sheets.loadInfo()
    lastLoad = Date.now()
  }

  const sheet = sheets.sheetsByIndex[0]
  const rows = await sheet.getRows()
  const row = rows.find((row) => (row.get('Dirección de correo electrónico') as string).toLowerCase().startsWith(correo.toLowerCase()))

  if(row == null) {
    return c.json({
      error: "No se encontró el correo",
    }, 404)
  }

  return c.json({
    correo: encodeURIComponent(row.get('Dirección de correo electrónico')?.trim()),
    nombre: encodeURIComponent(row.get('Nombre y apellido (Juan Lopez)')?.trim()),
    cargo: encodeURIComponent(row.get('Cargo')?.trim()),
    carrera: encodeURIComponent(row.get('Carrera')?.trim()),
    selfie: encodeURIComponent(row.get('Sube una selfie')?.trim() || 'https://mi.utem.cl/static/img/topicons/icono-estudiante-activo.svg')
  })
})

app.get('/valida/:correo', async (c) => {
  const {correo} = c.req.param()

  if(lastLoad === 0 || ((Date.now() - lastLoad) > (1000 * 60 * 5))) {
    await sheets.loadInfo()
    lastLoad = Date.now()
  }

  const sheet = sheets.sheetsByIndex[0]
  const rows = await sheet.getRows()
  const row = rows.find((row) => (row.get('Dirección de correo electrónico') as string).toLowerCase().startsWith(correo.toLowerCase()))

  if(row == null) {
    return c.json({
      error: "No se encontró el correo!",
    }, 404)
  }

  return c.json({
    status: 200,
    message: 'Correo válido!'
  })
})

app.get('/static/*', async (c) => {
  const path = c.req.path.replace('/static/', '')
  const file = Bun.file(`./public/${path}`)
  return new Response(file.stream(), {
    headers: {
      'Content-Type': file.type
    }
  });
})

app.get('/credencial/:correo', async (c) => {
  let { correo } = c.req.param()
  correo = decodeURIComponent(correo).toLowerCase()
  if(correo.includes('@')) {
    correo = correo.split('@')[0]
  }

  let data: Record<string, string> = {};

  const cachedData = Bun.file(`.cache/data/${correo}.json`)
  if(await cachedData.exists()) {
    data = JSON.parse(await cachedData.text())
  } else {
    if(lastLoad === 0 || ((Date.now() - lastLoad) > (1000 * 60 * 5))) {
      await sheets.loadInfo()
      lastLoad = Date.now()
    }

    const sheet = sheets.sheetsByIndex[0]
    const rows = await sheet.getRows()
    const row = rows.find((row) => (row.get('Dirección de correo electrónico') as string).toLowerCase().startsWith(correo.toLowerCase()))

    if(row == null) {
      return c.text(`No se encontró esa credencial!`, 404)
    }

    data = {
      correo: (row.get('Dirección de correo electrónico')?.trim()),
      nombre: (row.get('Nombre y apellido (Juan Lopez)')?.trim()),
      cargo: (row.get('Cargo')?.trim()),
      carrera: (row.get('Carrera')?.trim()),
      photo: (row.get('Sube una selfie')?.trim() || '/static/persona.svg'),
      url: (row.get('url')?.trim() || `https://linktr.ee/utem.cl?utm_src=credencial_representantes`)
    };

    const id = data.photo.startsWith('https://drive.google.com') ? (new URL(data['photo'])).searchParams.get('id') : null;
    const file = id != null ? await tsGoogleDrive.getFile(id) : null;

    if (file != null) {
      data['photo'] = `data:image/png;base64,${(await file.download()).toString('base64')}`
    }

    await Bun.write(`.cache/data/${correo}.json`, JSON.stringify(data))
  }

  const html = Bun.file('./public/credencial.html')
  let text = (await html.text())
  for(let placeholder of Object.keys(data)) {
    text = text.replaceAll(`{${placeholder}}`, data[placeholder])
  }

  return c.html(text)
})

export default app