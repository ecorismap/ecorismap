import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { Checkout_sessions, License, Price, Product } from '../types';
import { Platform } from 'react-native';
import {
  collection,
  firestore,
  functions,
  getDocs,
  query,
  where,
  httpsCallable,
  getDoc,
  orderBy,
} from '../lib/firebase/firebase';

export type UsePurchasesWebReturnType = {
  isLoading: boolean;
  products: { product: Product; prices: { priceId: string; price: Price }[] }[];
  purchaseItem: (price: string) => Promise<void>;
  customerLicense: License | undefined;
  customerPortal: string | undefined;
};

export const usePurchasesWeb = (): UsePurchasesWebReturnType => {
  const currentUser = useSelector((state: RootState) => state.user.uid);
  const [products, setProducts] = useState<{ product: Product; prices: { priceId: string; price: Price }[] }[]>([]);
  const [customerLicense, setCustomerLicense] = useState<License | undefined>(undefined);
  const [customerPortal, setCustomerPortal] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const getPortalLink = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    const createPortalLink = httpsCallable(functions, 'ext-firestore-stripe-payments-createPortalLink');
    const { data: link } = await createPortalLink({ returnUrl: window.location.origin });
    //@ts-ignore
    setCustomerPortal(link.url);
  }, []);

  const checkPurchased = useCallback(async () => {
    if (currentUser === undefined) {
      setCustomerLicense(undefined);
      return;
    }
    const q = query(
      collection(firestore, 'customers', currentUser, 'subscriptions'),
      where('status', 'in', ['active'])
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      setCustomerLicense('Free');
      return;
    }
    const subDoc = querySnapshot.docs[0];
    const subData = subDoc.data();

    // product フィールドが DocumentReference 型であることを想定
    const productRef = subData.product;
    const productSnap = await getDoc(productRef);
    if (!productSnap.exists()) {
      setCustomerLicense('Unknown');
      return;
    }

    const productData = productSnap.data() as { name?: License };
    setCustomerLicense(productData.name ?? 'Unknown');
    await getPortalLink();
  }, [currentUser, getPortalLink]);

  const purchaseItem = async (price: string) => {
    setIsLoading(true);
    const checkoutSession = {
      automatic_tax: true,
      tax_id_collection: true,
      collect_shipping_address: true,
      allow_promotion_codes: true,
      line_items: [{ price, quantity: 1 }],
      success_url: window.location.origin,
      cancel_url: window.location.origin,
      metadata: {
        key: 'value',
      },
    };

    const docRef = await firestore
      .collection('customers')
      .doc(currentUser)
      .collection('checkout_sessions')
      .add(checkoutSession);

    docRef.onSnapshot((snap) => {
      const { error, url } = snap.data() as Checkout_sessions;
      if (error) {
        console.log('$$$$$$$$$', error.message);
        setIsLoading(false);
      }
      if (url) {
        setIsLoading(false);
        window.location.assign(url);
      }
    });
  };

  const getProductData = useCallback(async () => {
    const q = query(collection(firestore, 'products'), where('active', '==', true), orderBy('metadata.no'));
    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs.map(async (productDoc) => {
      const product = productDoc.data() as Product;
      //エラーで読み込まれないときは、orderByのためのインデックスが作成されていない。
      //デベロッパーコンソールにindex作成のリンクが出力されているのでクリック。
      const pricesRef = collection(productDoc.ref, 'prices');
      const pricesQuery = query(pricesRef, where('active', '==', true));
      const priceSnap = await getDocs(pricesQuery);
      const prices = priceSnap.docs.map((priceDoc) => ({
        priceId: priceDoc.id,
        price: priceDoc.data() as Price,
      }));
      return { product, prices };
    });
    setProducts(await Promise.all(data));
  }, []);

  // const getProductData = useCallback(async () => {
  //   //   // try {
  //   //   //   const getProducts = functions.httpsCallable('getProducts');
  //   //   //   const { data } = await getProducts();
  //   //   //   setProducts(data as Product[]);
  //   //   // } catch (e) {
  //   //   //   console.log(e);
  //   //   // }
  //   const data: { product: Product; prices: { priceId: string; price: Price }[] }[] = [
  //     {
  //       product: {
  //         name: 'Basic',
  //         active: true,
  //         description: '',
  //         images: [''],
  //         metadata: { projects: 5, members: 5 },
  //       },
  //       prices: [
  //         {
  //           priceId: 'price_1L8GNwHhhnnic563PobXLtRS',
  //           price: {
  //             active: true,
  //             unit_amount: 1000,
  //             interval: 'year',
  //             currency: 'jpy',
  //             description: '',
  //             type: 'recurring',
  //             interval_count: 1,
  //             trial_period_days: null,
  //           },
  //         },
  //       ],
  //     },
  //     {
  //       product: {
  //         name: 'Pro',
  //         active: true,
  //         description: '',
  //         images: [''],
  //         metadata: { projects: 10, members: 10 },
  //       },
  //       prices: [
  //         {
  //           priceId: 'price_1L8GbhHhhnnic563zUyukT7D',
  //           price: {
  //             active: true,
  //             unit_amount: 2000,
  //             interval: 'year',
  //             currency: 'jpy',
  //             description: '',
  //             type: 'recurring',
  //             interval_count: 1,
  //             trial_period_days: null,
  //           },
  //         },
  //       ],
  //     },
  //     {
  //       product: {
  //         name: 'BusinessA',
  //         active: true,
  //         description: '',
  //         images: [''],
  //         metadata: { projects: 10, members: 20 },
  //       },
  //       prices: [
  //         {
  //           priceId: 'price_1L8GbjHhhnnic563qmuOMs56',
  //           price: {
  //             active: true,
  //             unit_amount: 10000,
  //             interval: 'year',
  //             currency: 'jpy',
  //             description: '',
  //             type: 'recurring',
  //             interval_count: 1,
  //             trial_period_days: null,
  //           },
  //         },
  //       ],
  //     },
  //     {
  //       product: {
  //         name: 'BusinessB',
  //         active: true,
  //         description: '',
  //         images: [''],
  //         metadata: { projects: 5, members: 40 },
  //       },
  //       prices: [
  //         {
  //           priceId: 'price_1L8GblHhhnnic563M4heh7GS',
  //           price: {
  //             active: true,
  //             unit_amount: 10000,
  //             interval: 'year',
  //             currency: 'jpy',
  //             description: '',
  //             type: 'recurring',
  //             interval_count: 1,
  //             trial_period_days: null,
  //           },
  //         },
  //       ],
  //     },
  //   ];
  //   setProducts(data);
  // }, []);

  useEffect(() => {
    setIsLoading(true);
    (async () => await getProductData())();
    (async () => await getPortalLink())();
    checkPurchased();
    setIsLoading(false);
  }, [checkPurchased, getPortalLink, getProductData]);

  return {
    products,
    purchaseItem,
    customerLicense,
    customerPortal,
    isLoading,
  } as const;
};
