import React from 'react';
import { useParams } from 'react-router-dom';
import { useClientData } from '../hooks/useClientData';
import CoachingTracker from '../components/CoachingTracker';

export default function TrackerPage() {
  const { slug } = useParams();
  const { data, loading, error, updateData } = useClientData(slug);

  if (loading) return (
    <div style={{
      minHeight: '100vh', background: '#F5F1EB', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif", color: '#8A8070',
    }}>
      Loading your tracker...
    </div>
  );

  if (error) return (
    <div style={{
      minHeight: '100vh', background: '#F5F1EB', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif", color: '#C4887A',
    }}>
      Tracker not found. Check your link and try again.
    </div>
  );

  return <CoachingTracker data={data} onUpdate={updateData} />;
}
