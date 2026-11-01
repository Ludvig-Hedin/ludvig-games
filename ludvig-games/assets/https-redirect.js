// Keep production links on HTTPS. Local Mac and development addresses stay local.
if (location.protocol === 'http:' && location.hostname === 'games.ludvighedin.com') {
  location.replace(location.href.replace(/^http:/, 'https:'));
}
