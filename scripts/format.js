const axios = require('axios')
const { program } = require('commander')
const normalize = require('normalize-url')
const IPTVChecker = require('iptv-checker')
const parser = require('./helpers/parser')
const utils = require('./helpers/utils')
const file = require('./helpers/file')
const log = require('./helpers/log')
const epg = require('./helpers/epg')

const ignoreStatus = ['Geo-blocked', 'Not 24/7']

program
  .usage('[OPTIONS]...')
  .option('--debug', 'Enable debug mode')
  .option('--offline', 'Enable offline mode')
  .option('-d, --delay <delay>', 'Set delay for each request', parseNumber, 0)
  .option('-t, --timeout <timeout>', 'Set timeout for each request', parseNumber, 5000)
  .option('-c, --country <country>', 'Comma-separated list of country codes', '')
  .option('-e, --exclude <exclude>', 'Comma-separated list of country codes to be excluded', '')
  .parse(process.argv)

const config = program.opts()
const checker = new IPTVChecker({
  timeout: config.timeout
})

let buffer, origins
async function main() {
  log.start()

  const include = config.country.split(',').filter(i => i)
  const exclude = config.exclude.split(',').filter(i => i)
  let files = await file.list(include, exclude)
  if (!files.length) log.print(`No files is selected\n`)
  for (const file of files) {
    await parser.parsePlaylist(file).then(updatePlaylist).then(savePlaylist)
  }

  log.finish()
}

function savePlaylist(playlist) {
  if (file.read(playlist.url) !== playlist.toString()) {
    log.print(`File '${playlist.url}' has been updated\n`)
    playlist.updated = true
  }

  playlist.save()
}

async function updatePlaylist(playlist) {
  const total = playlist.channels.length
  log.print(`Processing '${playlist.url}'...\n`)

  let channels = {}
  let codes = {}
  if (!config.offline) {
    channels = await loadChannelsJson()
    codes = await loadCodes()
  }

  buffer = {}
  origins = {}
  for (const [i, channel] of playlist.channels.entries()) {
    const curr = i + 1
    updateTvgName(channel)
    updateTvgId(channel, playlist)
    updateTvgCountry(channel)
    normalizeUrl(channel)

    const data = channels[channel.tvg.id]
    const epgData = codes[channel.tvg.id]
    updateLogo(channel, data, epgData)
    updateGroupTitle(channel, data)
    updateTvgLanguage(channel, data)

    if (config.offline || ignoreStatus.includes(channel.status)) {
      continue
    }

    await checker
      .checkStream(channel.data)
      .then(parseResult)
      .then(result => {
        updateStatus(channel, result.status)
        if (result.status === 'online') {
          buffer[i] = result
          updateOrigins(channel, result.requests)
          updateResolution(channel, result.resolution)
        } else {
          buffer[i] = null
          if (config.debug) {
            log.print(`  INFO: ${channel.url} (${result.error})\n`)
          }
        }
      })
      .catch(err => {
        buffer[i] = null
        if (config.debug) {
          log.print(`  ERR: ${channel.data.url} (${err.message})\n`)
        }
      })
  }

  for (const [i, channel] of playlist.channels.entries()) {
    if (!buffer[i]) continue
    const { requests } = buffer[i]
    updateUrl(channel, requests)
  }

  return playlist
}

function updateOrigins(channel, requests) {
  if (!requests) return
  const origin = new URL(channel.url)
  const target = new URL(requests[0])
  const type = origin.host === target.host ? 'origin' : 'redirect'
  requests.forEach(url => {
    const key = utils.removeProtocol(url)
    if (!origins[key] && type === 'origin') {
      origins[key] = channel.url
    }
  })
}

function updateStatus(channel, status) {
  switch (status) {
    case 'online':
      channel.status = channel.status === 'Offline' ? 'Not 24/7' : null
      break
    case 'offline':
    case 'error_403':
      channel.status = 'Offline'
      break
  }
}

function updateResolution(channel, resolution) {
  if (!channel.resolution.height && resolution) {
    channel.resolution = resolution
  }
}

function updateUrl(channel, requests) {
  for (const request of requests) {
    let key = utils.removeProtocol(channel.url)
    if (origins[key]) {
      channel.updateUrl(origins[key])
      break
    }

    key = utils.removeProtocol(request)
    if (origins[key]) {
      channel.updateUrl(origins[key])
      break
    }
  }
}

function parseResult(result) {
  return {
    status: parseStatus(result.status),
    resolution: result.status.ok ? parseResolution(result.status.metadata.streams) : null,
    requests: result.status.ok ? parseRequests(result.status.metadata.requests) : [],
    error: !result.status.ok ? result.status.reason : null
  }
}

function parseStatus(status) {
  if (status.ok) {
    return 'online'
  } else if (status.reason.includes('timed out')) {
    return 'timeout'
  } else if (status.reason.includes('403')) {
    return 'error_403'
  } else if (status.reason.includes('not one of 40{0,1,3,4}')) {
    return 'error_40x' // 402, 451
  } else {
    return 'offline'
  }
}

function parseResolution(streams) {
  const resolution = streams
    .filter(stream => stream.codec_type === 'video')
    .reduce(
      (acc, curr) => {
        if (curr.height > acc.height) return { width: curr.width, height: curr.height }
        return acc
      },
      { width: 0, height: 0 }
    )

  return resolution.width > 0 && resolution.height > 0 ? resolution : null
}

function parseRequests(requests) {
  requests = requests.map(r => r.url)
  requests.shift()

  return requests
}

function updateTvgName(channel) {
  if (!channel.tvg.name) {
    channel.tvg.name = channel.name.replace(/\"/gi, '')
  }
}

function updateTvgId(channel, playlist) {
  const code = playlist.country.code
  if (!channel.tvg.id && channel.tvg.name) {
    const id = utils.name2id(channel.tvg.name)
    channel.tvg.id = id ? `${id}.${code}` : ''
  }
}

function updateTvgCountry(channel) {
  if (!channel.countries.length && channel.tvg.id) {
    const code = channel.tvg.id.split('.')[1] || null
    const name = utils.code2name(code)
    channel.countries = name ? [{ code, name }] : []
    channel.tvg.country = channel.countries.map(c => c.code.toUpperCase()).join(';')
  }
}

function updateLogo(channel, data, epgData) {
  if (!channel.logo) {
    if (data) {
      channel.logo = data.logo
    } else if (epgData) {
      channel.logo = epgData.logo
    }
  }
}

function updateTvgLanguage(channel, data) {
  if (!channel.tvg.language) {
    if (data) {
      channel.tvg.language = data.languages.map(l => l.name).join(';')
    } else if (channel.countries.length) {
      const countryCode = channel.countries[0].code
      channel.tvg.language = utils.country2language(countryCode)
    }
  }
}

function updateGroupTitle(channel, data) {
  if (!channel.group.title && data) {
    channel.group.title = channel.category || data.category || ''
  }
}

function normalizeUrl(channel) {
  const normalized = normalize(channel.url, { stripWWW: false })
  const decoded = decodeURIComponent(normalized).replace(/\s/g, '+')
  channel.updateUrl(decoded)
}

function parseNumber(str) {
  return parseInt(str)
}

function loadCodes() {
  return epg.codes
    .load()
    .then(codes => {
      let output = {}
      codes.forEach(item => {
        output[item['tvg_id']] = item
      })
      return output
    })
    .catch(console.log)
}

function loadChannelsJson() {
  return axios
    .get('https://iptv-org.github.io/iptv/channels.json')
    .then(r => r.data)
    .then(channels => {
      let output = {}
      channels.forEach(channel => {
        const item = output[channel.tvg.id]
        if (!item) {
          output[channel.tvg.id] = channel
        } else {
          item.logo = item.logo || channel.logo
          item.languages = item.languages.length ? item.languages : channel.languages
          item.category = item.category || channel.category
        }
      })
      return output
    })
    .catch(console.log)
}

main()
