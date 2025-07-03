import { useState, useEffect } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';

export default function Home() {
  const [studies, setStudies] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStudies();
  }, []);

  const fetchStudies = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/studies');
      if (!response.ok) {
        throw new Error('Failed to fetch studies');
      }
      const data = await response.json();
      setStudies(data.studies);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="header">
          <h1>🏥 DICOM Medical Image Viewer</h1>
          <p>Loading studies...</p>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="header">
          <h1>🏥 DICOM Medical Image Viewer</h1>
          <p style={{ color: 'red' }}>Error: {error}</p>
          <button onClick={fetchStudies}>Retry</button>
        </div>
      </Layout>
    );
  }

  const studyEntries = Object.entries(studies);

  return (
    <Layout>
      <div className="header">
        <h1>🏥 DICOM Medical Image Viewer</h1>
        <p>Professional Medical Imaging with Advanced Tools</p>
        <p>Found {studyEntries.length} studies with comprehensive DICOM metadata</p>
      </div>

      {studyEntries.length === 0 ? (
        <div className="container">
          <p>No DICOM studies found. Please add DICOM files to the DICOM directory.</p>
        </div>
      ) : (
        studyEntries.map(([studyUID, study]) => (
          <div key={studyUID} className="study-section">
            <h2 className="study-header">
              📋 Study: {study.studyDescription}
            </h2>

            <div className="study-info">
              <div className="info-row">
                <span className="info-label">👤 Patient:</span>
                <span className="info-value">{study.patientName} (ID: {study.patientID})</span>
              </div>
              <div className="info-row">
                <span className="info-label">📅 Study Date:</span>
                <span className="info-value">{study.studyDate} at {study.studyTime}</span>
              </div>
              <div className="info-row">
                <span className="info-label">🔬 Study UID:</span>
                <span className="info-value">{study.studyInstanceUID}</span>
              </div>
            </div>

            <div className="series-grid">
              {Object.entries(study.series).map(([seriesUID, series]) => (
                <div key={seriesUID} className="series-card">
                  <div className="series-header">
                    <h3 className="series-title">
                      📊 Series {series.seriesNumber}: {series.seriesDescription}
                    </h3>
                  </div>

                  <div className="series-info">
                    <div className="info-row">
                      <span className="info-label">🏷️ Modality:</span>
                      <span className="info-value">{series.modality}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">📸 Instances:</span>
                      <span className="info-value">{series.instances.length}</span>
                    </div>

                    <div className="instances-list">
                      {series.instances.map((instance, index) => (
                        <div key={index} className="instance-item">
                          <div>
                            <div className="instance-filename">{instance.filename}</div>
                            <small>{instance.rows}×{instance.columns} pixels</small>
                          </div>
                          <div>
                            <span className="instance-number">#{instance.instanceNumber}</span>
                            <Link className="view-button" href={`/viewer/${instance.filename}`} style={{
                              marginLeft: '10px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              width: 'auto'
                            }}>
                              {/* <a className="view-button" > */}
                              🔍 View
                              {/* </a> */}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </Layout>
  );
}
