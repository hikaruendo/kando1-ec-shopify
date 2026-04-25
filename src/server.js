import { createApp, getRuntimeConfig } from './app.js';

const { port } = getRuntimeConfig();
const app = await createApp();

app.listen(port, () => {
  console.log(`kando1-bulk-pricing api listening on :${port}`);
});
