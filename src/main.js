import { Loader } from './ui/Loader.js';
import { Game } from './game/Game.js';
import { Store } from './core/Store.js';
import { setTextStyle, t } from './text.js';

async function main() {
  setTextStyle(Store.settings.textStyle);
  document.documentElement.style.setProperty('--ui-scale', Store.settings.textSize);
  const loader = new Loader();
  const game = new Game(document.getElementById('scene'));
  // handy from the devtools console
  window.__sundown = game;
  window.__loader = loader;

  try {
    await loader.run(game.bootSteps());
  } catch (err) {
    console.error(err);
    document.getElementById('progress-label').textContent = t('boot.failed', { msg: err.message || err });
    return;
  }

  // Screenshot mode for the README (?shot=menu | play | boss): sets up the
  // scene without a click. Sound stays off because there is no user gesture.
  const shot = new URLSearchParams(location.search).get('shot');
  if (shot) {
    loader.skip();
    game.capture(shot);
    return;
  }

  await loader.waitForEngage();
  await game.engage();
  await loader.leave();
}

main();
