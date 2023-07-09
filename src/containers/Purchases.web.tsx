import React, { useCallback } from 'react';
import Purchases from '../components/pages/Purchases.web';
import { usePurchasesWeb } from '../hooks/usePurchasesWeb';
import { Props_Purchases } from '../routes';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

export default function PurchasesContainers({}: Props_Purchases) {
  const stripePromise = loadStripe(
    'pk_test_51L5myZHhhnnic563jpLxIMRg8hEKNQW5sbLlgEa32tmKgkwsDTK2WhkFQEC9dIb2sYWHcAfcmO52d6jHFi0sjaQ000A1Sn5Jf5'
  );

  return (
    <Elements stripe={stripePromise}>
      <PurchasesWeb />
    </Elements>
  );
}

function PurchasesWeb() {
  const { isLoading, products, customerLicense, customerPortal, purchaseItem } = usePurchasesWeb();

  const onPressPurchase = useCallback(
    async (price: string) => {
      await purchaseItem(price);
    },
    [purchaseItem]
  );
  return (
    <Purchases
      products={products}
      customerLicense={customerLicense}
      customerPortal={customerPortal}
      isLoading={isLoading}
      onPressPurchase={onPressPurchase}
    />
  );
}
