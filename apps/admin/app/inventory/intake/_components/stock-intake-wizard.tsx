'use client';

import { useState } from 'react';
import styles from './stock-intake-wizard.module.css';

export function StockIntakeWizard() {
  const [tab, setTab] = useState<'new' | 'existing'>('new');

  return (
    <div className={styles.wizardContainer}>
      <div className={styles.tabs}>
        <button 
          className={tab === 'new' ? styles.activeTab : ''} 
          onClick={() => setTab('new')}
        >
          ???? Product
        </button>
        <button 
          className={tab === 'existing' ? styles.activeTab : ''} 
          onClick={() => setTab('existing')}
        >
          ?????? ??? ???? ???
        </button>
      </div>

      <div className={styles.tabContent}>
        {tab === 'new' ? <NewProductIntake /> : <ExistingProductIntake />}
      </div>
    </div>
  );
}

function NewProductIntake() {
  return (
    <div>
      <h2>???? Product</h2>
      {/* 4 steps would go here */}
      <p>Step 1: Product-?? ????</p>
      <p>Step 2: Color and Size</p>
      <p>Step 3: Price and Supplier</p>
      <p>Step 4: Review and Save</p>
    </div>
  );
}

function ExistingProductIntake() {
  return (
    <div>
      <h2>?????? ??? ???? ???</h2>
      {/* 4 steps would go here */}
      <p>Step 1: Product ??????</p>
      <p>Step 2: Quantity by Variant</p>
      <p>Step 3: Price and Supplier</p>
      <p>Step 4: Review and Save</p>
    </div>
  );
}
