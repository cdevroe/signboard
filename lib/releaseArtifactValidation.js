const crypto = require('crypto');
const fs = require('fs');

const AR_MAGIC = Buffer.from('!<arch>\n', 'ascii');
const AR_HEADER_SIZE = 60;
const MIN_RELEASE_ARTIFACT_BYTES = 1024 * 1024;

function listArArchiveMembers(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < AR_MAGIC.length || !buffer.subarray(0, AR_MAGIC.length).equals(AR_MAGIC)) {
    throw new Error('File is not an ar archive.');
  }

  const members = [];
  let offset = AR_MAGIC.length;

  while (offset < buffer.length) {
    if (offset + AR_HEADER_SIZE > buffer.length) {
      throw new Error('Archive contains a truncated member header.');
    }

    const header = buffer.subarray(offset, offset + AR_HEADER_SIZE);
    if (header.toString('ascii', 58, 60) !== '`\n') {
      throw new Error('Archive contains an invalid member header.');
    }

    const rawName = header.toString('utf8', 0, 16).trim();
    const rawSize = header.toString('ascii', 48, 58).trim();
    const size = Number.parseInt(rawSize, 10);
    if (!Number.isInteger(size) || size < 0) {
      throw new Error('Archive contains an invalid member size.');
    }

    const dataOffset = offset + AR_HEADER_SIZE;
    const dataEnd = dataOffset + size;
    if (dataEnd > buffer.length) {
      throw new Error('Archive contains truncated member data.');
    }

    let name = rawName.replace(/\/$/, '');
    let contentOffset = dataOffset;
    if (rawName.startsWith('#1/')) {
      const extendedNameLength = Number.parseInt(rawName.slice(3), 10);
      if (!Number.isInteger(extendedNameLength) || extendedNameLength < 0 || extendedNameLength > size) {
        throw new Error('Archive contains an invalid extended member name.');
      }
      name = buffer
        .subarray(dataOffset, dataOffset + extendedNameLength)
        .toString('utf8')
        .replace(/\0+$/g, '');
      contentOffset += extendedNameLength;
    }

    members.push({
      name,
      size: dataEnd - contentOffset,
      data: buffer.subarray(contentOffset, dataEnd),
    });

    offset = dataEnd + (size % 2);
  }

  return members;
}

function inspectDebianPackageBuffer(buffer) {
  let members;
  try {
    members = listArArchiveMembers(buffer);
  } catch (error) {
    return {
      valid: false,
      members: [],
      errors: [String(error?.message || error)],
    };
  }

  return inspectDebianPackageMembers(members);
}

function inspectDebianPackageMembers(members) {
  const names = members.map(({ name }) => name);
  const errors = [];
  const debianBinary = members.find(({ name }) => name === 'debian-binary');
  if (!debianBinary) {
    errors.push('Missing debian-binary member.');
  } else if (debianBinary.data.toString('utf8').trim() !== '2.0') {
    errors.push('Unsupported or invalid debian-binary version.');
  }
  if (!names.some((name) => /^control\.tar(?:\.|$)/.test(name))) {
    errors.push('Missing control.tar member.');
  }
  if (!names.some((name) => /^data\.tar(?:\.|$)/.test(name))) {
    errors.push('Missing data.tar member.');
  }

  return {
    valid: errors.length === 0,
    members: names,
    errors,
  };
}

function inspectDebianPackageFile(filePath) {
  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(filePath, 'r');
    const fileSize = fs.fstatSync(fileDescriptor).size;
    const members = listArArchiveMembersFromFile(fileDescriptor, fileSize);
    return inspectDebianPackageMembers(members);
  } catch (error) {
    return {
      valid: false,
      members: [],
      errors: [String(error?.message || error)],
    };
  } finally {
    if (Number.isInteger(fileDescriptor)) {
      fs.closeSync(fileDescriptor);
    }
  }
}

function listArArchiveMembersFromFile(fileDescriptor, fileSize) {
  const magic = readFileRange(fileDescriptor, 0, AR_MAGIC.length);
  if (!magic.equals(AR_MAGIC)) {
    throw new Error('File is not an ar archive.');
  }

  const members = [];
  let offset = AR_MAGIC.length;
  while (offset < fileSize) {
    if (offset + AR_HEADER_SIZE > fileSize) {
      throw new Error('Archive contains a truncated member header.');
    }

    const header = readFileRange(fileDescriptor, offset, AR_HEADER_SIZE);
    if (header.toString('ascii', 58, 60) !== '`\n') {
      throw new Error('Archive contains an invalid member header.');
    }

    const rawName = header.toString('utf8', 0, 16).trim();
    const size = Number.parseInt(header.toString('ascii', 48, 58).trim(), 10);
    if (!Number.isInteger(size) || size < 0) {
      throw new Error('Archive contains an invalid member size.');
    }

    const dataOffset = offset + AR_HEADER_SIZE;
    const dataEnd = dataOffset + size;
    if (dataEnd > fileSize) {
      throw new Error('Archive contains truncated member data.');
    }

    let name = rawName.replace(/\/$/, '');
    let contentOffset = dataOffset;
    if (rawName.startsWith('#1/')) {
      const extendedNameLength = Number.parseInt(rawName.slice(3), 10);
      if (!Number.isInteger(extendedNameLength) || extendedNameLength < 0 || extendedNameLength > size) {
        throw new Error('Archive contains an invalid extended member name.');
      }
      name = readFileRange(fileDescriptor, dataOffset, extendedNameLength)
        .toString('utf8')
        .replace(/\0+$/g, '');
      contentOffset += extendedNameLength;
    }

    const contentSize = dataEnd - contentOffset;
    members.push({
      name,
      size: contentSize,
      data: name === 'debian-binary'
        ? readFileRange(fileDescriptor, contentOffset, contentSize)
        : Buffer.alloc(0),
    });
    offset = dataEnd + (size % 2);
  }

  return members;
}

function readFileRange(fileDescriptor, position, length) {
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(fileDescriptor, buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error('Archive ended unexpectedly while reading member data.');
  }
  return buffer;
}

function computeFileSha512(filePath) {
  const hash = crypto.createHash('sha512');
  const buffer = Buffer.alloc(1024 * 1024);
  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(filePath, 'r');
    let bytesRead;
    do {
      bytesRead = fs.readSync(fileDescriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    if (Number.isInteger(fileDescriptor)) {
      fs.closeSync(fileDescriptor);
    }
  }
  return hash.digest('base64');
}

module.exports = {
  MIN_RELEASE_ARTIFACT_BYTES,
  computeFileSha512,
  inspectDebianPackageBuffer,
  inspectDebianPackageFile,
  listArArchiveMembers,
};
