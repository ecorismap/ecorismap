import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { CheckBox } from '../molecules/CheckBox';
import { License, Price, Product } from '../../types';
import { Loading } from '../molecules/Loading';
import { Feather } from '@expo/vector-icons';
import { t } from '../../i18n/config';
import { getLocales } from 'expo-localization';
import { Pressable } from '../atoms/Pressable';

interface Props {
  products: { product: Product; prices: { priceId: string; price: Price }[] }[];
  isLoading: boolean;
  customerLicense: License | undefined;
  customerPortal: string | undefined;
  onPressPurchase: (price: string) => void;
}

export default function Purchases(props: Props) {
  const { products, isLoading, customerLicense, customerPortal, onPressPurchase } = props;

  return customerLicense === undefined ? (
    <View style={styles.container} />
  ) : customerLicense === 'Unknown' ? (
    <ErrorPage />
  ) : customerLicense === 'Free' ? (
    <ProductPage isLoading={isLoading} products={products} onPressPurchase={onPressPurchase} />
  ) : (
    <CustomerPage
      isLoading={isLoading}
      products={products}
      customerLicense={customerLicense}
      customerPortal={customerPortal}
    />
  );
}

interface ProductPage_Props {
  products: { product: Product; prices: { priceId: string; price: Price }[] }[];
  isLoading: boolean;
  onPressPurchase: (price: string) => void;
}

const ProductPage = (props: ProductPage_Props) => {
  const { isLoading, products, onPressPurchase } = props;
  const [checked, setChecked] = useState(false);
  const [checkedPlan, setCheckedPlan] = useState<boolean[]>([]);
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);

  const changeCheckedPlan = useCallback(
    (idx: number) => {
      if (products[idx].prices.length === 0) return;
      const clonedCheckedPlan = checkedPlan.map(() => false);
      clonedCheckedPlan[idx] = true;
      setCheckedPlan(clonedCheckedPlan);
      setSelectedPrice(products[idx].prices[0].priceId);
    },
    [checkedPlan, products]
  );

  useEffect(() => {
    //console.log(products);
    if (products.length === 0 || products[0].prices.length === 0) return;
    const initialChecked = products.map(() => false);
    initialChecked[0] = true;
    setCheckedPlan(initialChecked);
    setSelectedPrice(products[0].prices[0].priceId);
  }, [products]);

  return (
    <View style={styles.container}>
      <Loading visible={isLoading} text="" />
      <View style={{ marginBottom: 50 }}>
        <View style={styles.titleFrame}>
          <Text style={styles.title}>{`${t('Purchases.title')}`}</Text>
        </View>
        <View style={styles.frame}>
          <Text style={styles.subtitle}>{`${t('Purchases.menu1')}`}</Text>
          <View style={styles.products}>
            {products.map(({ product, prices }, idx) => {
              return (
                <Pressable
                  key={idx}
                  style={[styles.price, { backgroundColor: checkedPlan[idx] ? COLOR.ALFARED : COLOR.WHITE }]}
                  onPress={() => changeCheckedPlan(idx)}
                >
                  <Text style={styles.plan}>{product.name}</Text>
                  <Text>
                    {product.metadata.projects}
                    {t('common.project')}
                  </Text>
                  <Text>
                    {product.metadata.members}
                    {t('common.user')}
                  </Text>
                  {prices.map(({ priceId, price }) => (
                    <Text key={priceId}>{`${new Intl.NumberFormat(getLocales()[0]?.languageTag || 'en', {
                      style: 'currency',
                      currency: price.currency,
                      currencyDisplay: 'name',
                    }).format(price.unit_amount)}/${price.interval}`}</Text>
                  ))}
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.frame}>
          <Text style={styles.subtitle}>{`${t('Purchases.menu2')}`}</Text>
          <CheckBox
            style={{ backgroundColor: COLOR.WHITE }}
            label={t('Purchases.confirmCheck')}
            labelSize={16}
            labelColor={COLOR.BLACK}
            width={700}
            checked={checked}
            onCheck={setChecked}
          />
        </View>

        <View style={styles.purchase}>
          <Pressable
            style={[styles.button, { backgroundColor: checked ? COLOR.BLUE : COLOR.ALFABLUE }]}
            onPress={() => selectedPrice && onPressPurchase(selectedPrice)}
            disabled={!checked}
          >
            <Text style={{ color: COLOR.WHITE, fontWeight: 'bold', fontSize: 18 }}>{`${t('Purchases.apply')}`}</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ marginBottom: 100 }}>
        <View
          style={{
            backgroundColor: COLOR.GRAY2,
            width: 700,
            height: 600,
            marginBottom: 50,
            alignItems: 'center',
            borderRadius: 5,
          }}
        >
          <View style={{ width: 700 }}>
            <Text style={{ textAlign: 'left', fontSize: 20, fontWeight: 'bold', margin: 20 }}>
              {`${t('Purchases.notes')}`}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: COLOR.WHITE,
              width: 680,
              height: 500,
              padding: 50,
            }}
          >
            <Text>■　返金はしません</Text>
            <Text>■　更新してください</Text>
            <Text>■　更新してください</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const ErrorPage = () => {
  return (
    <View style={styles.container}>
      <View style={styles.errorFrame}>
        <Text>{`${t('Purchases.errorMessage1')}`}</Text>
        <Text>{`${t('Purchases.errorMessage2')}`}</Text>
      </View>
    </View>
  );
};

interface CustomerPage_Props {
  isLoading: boolean;
  products: { product: Product; prices: { priceId: string; price: Price }[] }[];
  customerPortal: string | undefined;
  customerLicense: string | undefined;
}

const CustomerPage = (props: CustomerPage_Props) => {
  const { isLoading, products, customerPortal, customerLicense } = props;
  return (
    <View style={styles.container}>
      <Loading visible={isLoading} text="" />
      <View style={[styles.titleFrame, { borderBottomColor: COLOR.DARKGREEN }]}>
        <Text style={styles.title}>{`${t('Purchases.accountInfo')}`}</Text>
      </View>
      <View style={styles.frame}>
        <Text style={styles.subtitle}>{`${t('Purchases.currentPlan')}`}</Text>
        <View style={styles.products}>
          {products.map(({ product, prices }, idx) => {
            return (
              <View
                key={idx}
                style={[
                  styles.price,
                  { backgroundColor: product.name === customerLicense ? COLOR.ALFARED : COLOR.WHITE },
                ]}
              >
                <Text style={styles.plan}>{product.name}</Text>
                <Text>
                  {product.metadata.projects}
                  {t('common.project')}
                </Text>
                <Text>
                  {product.metadata.members}
                  {t('common.user')}
                </Text>
                {prices.map(({ priceId, price }) => (
                  <Text key={priceId}>{`${new Intl.NumberFormat(getLocales()[0]?.languageTag || 'en', {
                    style: 'currency',
                    currency: price.currency,
                    currencyDisplay: 'name',
                  }).format(price.unit_amount)}/${price.interval}`}</Text>
                ))}
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.frame}>
        <Text style={styles.subtitle}>{`${t('Purchases.applicationInfo')}`}</Text>
        <View style={{ marginTop: 10, alignItems: 'center' }}>
          <Pressable
            style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}
            onPress={() => customerPortal && window.location.assign(customerPortal)}
          >
            <Text style={styles.portal}>{`${t('Purchases.applicationChange')}`}</Text>
            <Feather name="external-link" size={24} />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: COLOR.BLUE,
    borderColor: COLOR.GRAY2,
    borderRadius: 5,
    borderWidth: 1,
    padding: 20,
    textAlign: 'center',
    width: 700,
  },

  container: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    flex: 1,
    //justifyContent: 'center',
  },

  errorFrame: {
    alignItems: 'center',
    marginTop: 100,
    width: 700,
  },
  frame: {
    borderColor: COLOR.GRAY2,
    borderRadius: 5,
    borderWidth: 1,
    margin: 20,
    padding: 20,
    width: 700,
  },
  plan: { fontWeight: 'bold', marginBottom: 10 },
  portal: { fontSize: 14, marginHorizontal: 5, textDecorationLine: 'underline' },
  price: {
    alignItems: 'center',
    borderColor: COLOR.GRAY2,
    borderRadius: 5,
    borderWidth: 1,
    flex: 1,
    margin: 10,
    padding: 20,
  },
  products: {
    flexDirection: 'row',
  },
  purchase: {
    marginBottom: 10,
    marginHorizontal: 20,
    marginTop: 5,
    width: 700,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    margin: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  titleFrame: {
    borderBottomWidth: 4,
    borderColor: COLOR.BLUE,
    marginBottom: 20,
    marginHorizontal: 20,
    marginTop: 80,
    paddingHorizontal: 20,
    width: 700,
  },
});
