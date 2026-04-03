import React from 'react';
import './Header.css';

export default function Header({ secondsSince }) {
  const label = secondsSince === 0
    ? 'Just updated'
    : `${secondsSince}s ago`;

  return (
    <header className="header">
      <div className="header-brand">
        <div className="header-logo">FF</div>
        <span className="header-title">Focus Finder</span>
      </div>
      <div className="header-live">
        <span className="live-dot" />
        <span className="live-label">{label}</span>
      </div>
    </header>
  );
}
