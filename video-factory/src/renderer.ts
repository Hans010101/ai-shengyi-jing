import { Container } from '@cloudflare/containers';

export class VideoRenderer extends Container {
  defaultPort = 8080;
  sleepAfter = '30m';

  override onStart() { console.log('video renderer started'); }
  override onStop() { console.log('video renderer stopped'); }
  override onError(error: unknown) { console.error('video renderer error', error); }
}
