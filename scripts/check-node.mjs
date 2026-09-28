// Accept Node 22.12+ or any newer major (this machine ships Node 24).
export function checkNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  const ok = major > 22 || (major === 22 && minor >= 12);
  if (!ok) {
    throw new Error(`This starter requires Node 22.12+ ; current Node is ${version}.`);
  }
}
checkNode();
