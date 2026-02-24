import Head from 'next/head';
import { AuthProvider } from '../contexts/AuthContext';
import '../styles/globals.css';
import '../styles/toolbar.css';
import '../styles/file-browser.css';
import '../styles/viewer.css';
import '../styles/cornerstone.css';
import '../styles/folder-upload.css';
import 'react-datepicker/dist/react-datepicker.css';

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Component {...pageProps} />
    </AuthProvider>
  );
}
