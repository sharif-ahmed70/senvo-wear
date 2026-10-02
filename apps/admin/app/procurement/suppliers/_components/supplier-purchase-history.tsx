'use client';

import { useEffect, useState } from 'react';
import { AdminApiClient } from '../../../_lib/api-client';
import { PurchaseContract } from '@senvo/contracts';
import styles from './supplier-workspace.module.css';

const client = new AdminApiClient();

export function SupplierPurchaseHistory({ supplierId }: { supplierId: string }) {
  const [purchases, setPurchases] = useState<PurchaseContract[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await client.listPurchases({ supplierId });
        setPurchases(result.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [supplierId]);

  if (loading) return <div>Loading purchases...</div>;

  return (
    <div className={styles.detailCard} style={{ marginTop: '2rem' }}>
      <h3 className={styles.cardTitle}>????? History</h3>
      {purchases.length === 0 ? (
        <p>No purchases found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Total (Poisha)</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map(p => (
              <tr key={p.id}>
                <td>{new Date(p.purchaseDate || p.createdAt).toLocaleDateString()}</td>
                <td>{p.status}</td>
                <td>{p.totalMinor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
