import Head from 'next/head';
import '../styles/globals.css';
import '../styles/toolbar.css';
import '../styles/file-browser.css';
import '../styles/viewer.css';
import '../styles/cornerstone.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
