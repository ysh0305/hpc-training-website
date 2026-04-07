export function toTitleFromFolder(folderName) {
  return folderName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bHpc\b/g, "HPC")
    .replace(/\bSdsc\b/g, "SDSC")
    .replace(/\bCiml\b/g, "CIML");
}
