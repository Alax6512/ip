const file = require('./helpers/file')
const log = require('./helpers/log')
const db = require('./helpers/db')

const ROOT_DIR = './.gh-pages'

async function main() {
  await loadDatabase()
  createRootDirectory()
  createNoJekyllFile()
  generateIndex()
  generateCategoryIndex()
  generateCountryIndex()
  generateLanguageIndex()
  generateCategories()
  generateCountries()
  generateLanguages()
  generateChannelsJson()
  showResults()
}

async function loadDatabase() {
  log.print('Loading database...\n')
  await db.load()
}

function createRootDirectory() {
  log.print('Creating .gh-pages folder...\n')
  file.createDir(ROOT_DIR)
}

function createNoJekyllFile() {
  log.print('Creating .nojekyll...\n')
  file.create(`${ROOT_DIR}/.nojekyll`)
}

function generateIndex() {
  log.print('Generating index.m3u...\n')
  const channels = db.channels
    .sortBy(['name', 'status', 'resolution.height', 'url'], ['asc', 'asc', 'desc', 'asc'])
    .removeDuplicates()
    .removeOffline()
    .get()
  const guides = channels.map(channel => channel.tvg.url)

  const filename = `${ROOT_DIR}/index.m3u`
  const urlTvg = generateUrlTvg(guides)
  file.create(filename, `#EXTM3U url-tvg="${urlTvg}"\n`)

  const nsfwFilename = `${ROOT_DIR}/index.nsfw.m3u`
  file.create(nsfwFilename, `#EXTM3U url-tvg="${urlTvg}"\n`)

  for (const channel of channels) {
    if (!channel.isNSFW()) {
      file.append(filename, channel.toString())
    }
    file.append(nsfwFilename, channel.toString())
  }
}

function generateCategoryIndex() {
  log.print('Generating index.category.m3u...\n')
  const channels = db.channels
    .sortBy(
      ['category', 'name', 'status', 'resolution.height', 'url'],
      ['asc', 'asc', 'asc', 'desc', 'asc']
    )
    .removeDuplicates()
    .removeOffline()
    .get()
  const guides = channels.map(channel => channel.tvg.url)

  const filename = `${ROOT_DIR}/index.category.m3u`
  const urlTvg = generateUrlTvg(guides)
  file.create(filename, `#EXTM3U url-tvg="${urlTvg}"\n`)

  for (const channel of channels) {
    file.append(filename, channel.toString())
  }
}

function generateCountryIndex() {
  log.print('Generating index.country.m3u...\n')

  const guides = []
  const lines = []
  for (const country of [{ code: 'undefined' }, ...db.countries.sortBy(['name']).all()]) {
    const channels = db.channels
      .sortBy(['name', 'status', 'resolution.height', 'url'], ['asc', 'asc', 'desc', 'asc'])
      .forCountry(country)
      .removeDuplicates()
      .removeNSFW()
      .removeOffline()
      .get()
    for (const channel of channels) {
      const groupTitle = channel.group.title
      channel.group.title = country.name || ''
      lines.push(channel.toString())
      channel.group.title = groupTitle
      guides.push(channel.tvg.url)
    }
  }

  const filename = `${ROOT_DIR}/index.country.m3u`
  const urlTvg = generateUrlTvg(guides)
  file.create(filename, `#EXTM3U url-tvg="${urlTvg}"\n${lines.join('')}`)
}

function generateLanguageIndex() {
  log.print('Generating index.language.m3u...\n')

  const guides = []
  const lines = []
  for (const language of [{ code: 'undefined' }, ...db.languages.sortBy(['name']).all()]) {
    const channels = db.channels
      .sortBy(['name', 'status', 'resolution.height', 'url'], ['asc', 'asc', 'desc', 'asc'])
      .forLanguage(language)
      .removeDuplicates()
      .removeNSFW()
      .removeOffline()
      .get()
    for (const channel of channels) {
      const groupTitle = channel.group.title
      channel.group.title = language.name || ''
      lines.push(channel.toString())
      channel.group.title = groupTitle
      guides.push(channel.tvg.url)
    }
  }

  const filename = `${ROOT_DIR}/index.language.m3u`
  const urlTvg = generateUrlTvg(guides)
  file.create(filename, `#EXTM3U url-tvg="${urlTvg}"\n${lines.join('')}`)
}

function generateCategories() {
  log.print(`Generating /categories...\n`)
  const outputDir = `${ROOT_DIR}/categories`
  file.createDir(outputDir)

  for (const category of [...db.categories.all(), { id: 'other' }]) {
    const channels = db.channels
      .sortBy(['name', 'status', 'resolution.height', 'url'], ['asc', 'asc', 'desc', 'asc'])
      .forCategory(category)
      .removeDuplicates()
      .removeOffline()
      .get()
    const guides = channels.map(channel => channel.tvg.url)

    const filename = `${outputDir}/${category.id}.m3u`
    const urlTvg = generateUrlTvg(guides)
    file.create(filename, `#EXTM3U url-tvg="${urlTvg}"\n`)
    for (const channel of channels) {
      file.append(filename, channel.toString())
    }
  }
}

function generateCountries() {
  log.print(`Generating /countries...\n`)
  const outputDir = `${ROOT_DIR}/countries`
  file.createDir(outputDir)

  for (const country of [...db.countries.all(), { code: 'undefined' }]) {
    const channels = db.channels
      .sortBy(['name', 'status', 'resolution.height', 'url'], ['asc', 'asc', 'desc', 'asc'])
      .forCountry(country)
      .removeDuplicates()
      .removeOffline()
      .removeNSFW()
      .get()
    const guides = channels.map(channel => channel.tvg.url)

    const filename = `${outputDir}/${country.code}.m3u`
    const urlTvg = generateUrlTvg(guides)
    file.create(filename, `#EXTM3U url-tvg="${urlTvg}"\n`)
    for (const channel of channels) {
      file.append(filename, channel.toString())
    }
  }
}

function generateLanguages() {
  log.print(`Generating /languages...\n`)
  const outputDir = `${ROOT_DIR}/languages`
  file.createDir(outputDir)

  for (const language of [...db.languages.all(), { code: 'undefined' }]) {
    const channels = db.channels
      .sortBy(['name', 'status', 'resolution.height', 'url'], ['asc', 'asc', 'desc', 'asc'])
      .forLanguage(language)
      .removeDuplicates()
      .removeOffline()
      .removeNSFW()
      .get()
    const guides = channels.map(channel => channel.tvg.url)

    const filename = `${outputDir}/${language.code}.m3u`
    const urlTvg = generateUrlTvg(guides)
    file.create(filename, `#EXTM3U url-tvg="${urlTvg}"\n`)
    for (const channel of channels) {
      file.append(filename, channel.toString())
    }
  }
}

function generateChannelsJson() {
  log.print('Generating channels.json...\n')
  const filename = `${ROOT_DIR}/channels.json`
  const channels = db.channels
    .sortBy(['name', 'status', 'resolution.height', 'url'], ['asc', 'asc', 'desc', 'asc'])
    .get()
    .map(c => c.toObject())
  file.create(filename, JSON.stringify(channels))
}

function showResults() {
  log.print(
    `Total: ${db.channels.count()} channels, ${db.countries.count()} countries, ${db.languages.count()} languages, ${db.categories.count()} categories.\n`
  )
}

function generateUrlTvg(guides) {
  const output = guides.reduce((acc, curr) => {
    if (curr && !acc.includes(curr)) acc.push(curr)
    return acc
  }, [])

  return output.sort().join(',')
}

main()
