const AUTHENTICATED_URL_ERROR = 'DSH_WEB_URL must be the full authenticated URL printed by dsh web, including a non-empty token query parameter';

export function parseHostLaunchUrl(rawUrl) {
  const value = rawUrl?.trim();
  if (!value) throw new Error(AUTHENTICATED_URL_ERROR);

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`DSH_WEB_URL must be an absolute URL: ${value}`);
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || !url.searchParams.get('token')) {
    throw new Error(AUTHENTICATED_URL_ERROR);
  }

  return {
    launchUrl: url.href,
    origin: url.origin,
  };
}

export async function authenticateHostPage(page, launchUrl) {
  const response = await page.goto(launchUrl, { waitUntil: 'domcontentloaded' });
  if (!response || response.status() >= 400) {
    throw new Error('Harness Web authentication failed; use the full URL printed by dsh web, including token=...');
  }
  await page.goto('/');
}
