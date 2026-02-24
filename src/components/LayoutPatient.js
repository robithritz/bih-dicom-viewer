import Head from 'next/head';

export default function Layout({ children, title = 'DICOM Viewer' }) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta charSet="UTF-8" />
      </Head>
      <div className="layout-w-full">
        {children}
      </div>

    </>
  );
}
