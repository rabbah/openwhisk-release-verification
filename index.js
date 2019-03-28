"use strict";

const releases = require('./lib/releases.js')
const verify = require('./lib/verify.js')
const fs = require('fs')

const PROJECT = 'openwhisk'

const versions = async params => {
  const versions = await releases.versions(PROJECT)
  return { versions }
}

const version_files = async params => {
  const path = params['__ow_path']
  const version = path.split('/').pop()
  const files = await releases.files(PROJECT, version)
  return { body: { files } } 
}

const file_check = async (project, version, file, keys) => {
  try {
    console.log('verifying', file)
    const sig = await releases.file_sig(project, version, file)
    const hash = await releases.file_hash(project, version, file)

    const file_name = await releases.download_file(project, version, file)

    const hash_operation = verify.hash(fs.createReadStream(file_name), hash)
    const sig_operation = verify.signature(fs.createReadStream(file_name), sig, keys)
    const archive_operation = verify.archive_files(fs.createReadStream(file_name), sig, keys)

    const [hash_result, sig_result, archive_files] = await Promise.all([hash_operation, sig_operation, archive_operation])

    const result = { name: file, files_valid: true, sig_valid: sig_result.valid, hash_valid: hash_result.valid, archive_files } 

    return result
  } catch (err) {
    // HTTP issues validating files should be returned as internal server errors
    err.status = 500
    throw err
  }
}

const validate_version_file = async params => {
  const subpaths = params['__ow_path'].split('/')
  const version = subpaths[subpaths.length - 2]

  console.log('verifying', version)

  const files = await releases.files(PROJECT, version)
  console.log('checking the following files:', files)

  const keys = await releases.keys(PROJECT)
  const file_checks = files.map(file => file_check(PROJECT, version, file, keys))

  const result = await Promise.all(file_checks)

  return { body: { files: result } } 
}

const wrap_errors = handler => {
  const wrapper = async params => {
    try {
      const result = await handler(params)
      return result
    } catch (err) {
      return { statusCode: err.status || 500, body: { error: err.message } } 
    }
  }

  return wrapper
}

module.exports = { versions, version_files: wrap_errors(version_files), validate_version_file: wrap_errors(validate_version_file) }
