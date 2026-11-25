import { BaseEntity, EntityStatus } from '../../models/base.model';
import { Brand } from '../../models/brand.model';
import { Category } from '../../models/category.model';
import { Color } from '../../models/color.model';
import { Customer } from '../../models/customer.model';
import { Product, ProductVariant } from '../../models/product.model';
import { Size, SizeType } from '../../models/size.model';
import { Supplier } from '../../models/supplier.model';
import { buildSku } from '../../utils/sku';
import { MockTables } from './mock-tables';

/*
 * Demo data for frontend development. Loaded into localStorage on first run and restorable from
 * Settings → Demo data. Brand and business names are fictional; emails use example.com and
 * GSTINs are format- and checksum-valid test values.
 */

const BASE_TIME = Date.UTC(2026, 10, 20, 10, 30);

function meta(id: string, daysAgo: number, status: EntityStatus = 'active'): BaseEntity {
  const iso = new Date(BASE_TIME - daysAgo * 86_400_000).toISOString();
  return { id, status, createdAt: iso, updatedAt: iso };
}

// ---- Categories -----------------------------------------------------------------------------------

const categories: Category[] = [
  ['cat-shirts', "Men's Shirts", 'Formal and casual shirts for men'],
  ['cat-tshirts', "Men's T-Shirts", 'Round neck, polo and henley T-shirts'],
  ['cat-jeans', 'Jeans', 'Denim jeans for men and women'],
  ['cat-trousers', 'Trousers', 'Formal trousers and chinos'],
  ['cat-kurtas', "Men's Kurtas", 'Kurtas and kurta sets for men'],
  ['cat-kurtis', "Women's Kurtis", 'Straight, A-line and anarkali kurtis'],
  ['cat-sarees', 'Sarees', 'Silk, cotton and designer sarees'],
  ['cat-salwar', 'Salwar Suits', 'Readymade and unstitched salwar suits'],
  ['cat-lehengas', 'Lehengas', 'Bridal and party wear lehengas'],
  ['cat-kids', 'Kids Wear', 'Clothing for boys and girls up to 14 years'],
  ['cat-western', "Women's Western Wear", 'Dresses, tops and co-ord sets'],
  ['cat-accessories', 'Accessories', 'Dupattas, stoles, belts and more'],
  ['cat-winter', 'Winter Wear', 'Sweaters, jackets and shawls'],
].map(([id, name, description], index) => ({
  ...meta(id, 60 - index, id === 'cat-winter' ? 'inactive' : 'active'),
  name,
  description,
}));

// ---- Brands -------------------------------------------------------------------------------------------

const brands: Brand[] = [
  ['brand-urban-weave', 'Urban Weave', 'Casual menswear'],
  ['brand-regal', 'Regal Threads', 'Formal shirts and trousers'],
  ['brand-blue-harbor', 'Blue Harbor Denim', 'Denim and casual wear'],
  ['brand-kalaa', 'Kalaa', 'Everyday ethnic wear for women'],
  ['brand-silk-route', 'Silk Route', 'Handloom and silk sarees'],
  ['brand-noor', 'Noor Ethnic', 'Festive and occasion wear'],
  ['brand-little-sprouts', 'Little Sprouts', 'Kidswear'],
  ['brand-comfort-knit', 'Comfort Knit', 'T-shirts and knitwear'],
  ['brand-house', 'Shop Label', 'Our in-house label'],
  ['brand-vintage', 'Vintage Loom', 'Discontinued label'],
].map(([id, name, description], index) => ({
  ...meta(id, 58 - index, id === 'brand-vintage' ? 'inactive' : 'active'),
  name,
  description,
}));

// ---- Sizes --------------------------------------------------------------------------------------------

const sizeRows: [string, string, SizeType, string][] = [
  ['size-xs', 'XS', 'clothing', 'Chest 34–36 in'],
  ['size-s', 'S', 'clothing', 'Chest 36–38 in'],
  ['size-m', 'M', 'clothing', 'Chest 38–40 in'],
  ['size-l', 'L', 'clothing', 'Chest 40–42 in'],
  ['size-xl', 'XL', 'clothing', 'Chest 42–44 in'],
  ['size-xxl', 'XXL', 'clothing', 'Chest 44–46 in'],
  ['size-3xl', '3XL', 'clothing', 'Chest 46–48 in'],
  ['size-28', '28', 'numeric', 'Waist 28 in'],
  ['size-30', '30', 'numeric', 'Waist 30 in'],
  ['size-32', '32', 'numeric', 'Waist 32 in'],
  ['size-34', '34', 'numeric', 'Waist 34 in'],
  ['size-36', '36', 'numeric', 'Waist 36 in'],
  ['size-38', '38', 'numeric', 'Waist 38 in'],
  ['size-40', '40', 'numeric', 'Waist 40 in'],
  ['size-free', 'Free Size', 'custom', 'One size fits most'],
  ['size-2-3y', '2-3 Y', 'custom', 'Kids, 2 to 3 years'],
  ['size-4-5y', '4-5 Y', 'custom', 'Kids, 4 to 5 years'],
  ['size-6-7y', '6-7 Y', 'custom', 'Kids, 6 to 7 years'],
  ['size-8-9y', '8-9 Y', 'custom', 'Kids, 8 to 9 years'],
];

const sizes: Size[] = sizeRows.map(([id, name, type, description], index) => ({
  ...meta(id, 55 - index),
  name,
  type,
  description,
}));

// ---- Colours ------------------------------------------------------------------------------------------

const colorRows: [string, string, string, string?][] = [
  ['color-black', 'Black', '#1C1C1C'],
  ['color-white', 'White', '#FFFFFF'],
  ['color-navy', 'Navy Blue', '#1F2A5A'],
  ['color-sky', 'Sky Blue', '#7EC8E3'],
  ['color-royal', 'Royal Blue', '#2B50AA'],
  ['color-indigo', 'Indigo Denim', '#3B4A6B', 'Classic denim wash'],
  ['color-maroon', 'Maroon', '#800020'],
  ['color-red', 'Red', '#C62828'],
  ['color-bottle-green', 'Bottle Green', '#0B5D3B'],
  ['color-olive', 'Olive', '#708238'],
  ['color-beige', 'Beige', '#E8D8C3'],
  ['color-grey', 'Grey', '#8A8D91', 'Mid grey / heather'],
  ['color-mustard', 'Mustard', '#D4A017'],
  ['color-pink', 'Pink', '#E75480'],
  ['color-peach', 'Peach', '#FFCBA4'],
  ['color-cream', 'Cream', '#FFF5D6', 'Off-white / ivory'],
  ['color-gold', 'Gold', '#C9A227', 'Zari and festive gold'],
  ['color-neon', 'Neon Green', '#39FF14', 'Seasonal — not restocked'],
];

const colors: Color[] = colorRows.map(([id, name, hexCode, description], index) => ({
  ...meta(id, 50 - index, id === 'color-neon' ? 'inactive' : 'active'),
  name,
  hexCode,
  description: description ?? '',
}));

// ---- Suppliers ----------------------------------------------------------------------------------------

const suppliers: Supplier[] = [
  {
    ...meta('sup-ganesh', 45),
    name: 'Shree Ganesh Textiles',
    contactPerson: 'Ramesh Patel',
    mobile: '9825012345',
    email: 'orders.sgt@example.com',
    address: 'Shop 214, Millennium Textile Market, Ring Road',
    city: 'Surat',
    state: 'Gujarat',
    pincode: '395002',
    gstNumber: '24AACFS4821K1Z8',
    openingBalance: 45000,
  },
  {
    ...meta('sup-tiruppur', 44),
    name: 'Tiruppur Knit Exports',
    contactPerson: 'Senthil Kumar',
    mobile: '9443022110',
    email: 'senthil.tke@example.com',
    address: '18, Kumar Nagar South, Avinashi Road',
    city: 'Tiruppur',
    state: 'Tamil Nadu',
    pincode: '641603',
    gstNumber: '33ABCPT7712M1ZD',
    openingBalance: 28500,
  },
  {
    ...meta('sup-jaipur', 40),
    name: 'Jaipur Prints & Co.',
    contactPerson: 'Neha Sharma',
    mobile: '9829033445',
    email: 'neha@jaipurprints.example.com',
    address: '56, Johari Bazar',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302003',
    gstNumber: '08AADFJ2209H1ZN',
    openingBalance: 12000,
  },
  {
    ...meta('sup-kolkata', 38),
    name: 'Kolkata Saree Emporium',
    contactPerson: 'Subhash Ghosh',
    mobile: '9830055667',
    email: 'kse.sales@example.com',
    address: '12B, Burrabazar, Kalakar Street',
    city: 'Kolkata',
    state: 'West Bengal',
    pincode: '700007',
    gstNumber: '19AAGCK6617D1ZI',
    openingBalance: 67500,
  },
  {
    ...meta('sup-mumbai', 33),
    name: 'Mumbai Denim Hub',
    contactPerson: 'Imran Shaikh',
    mobile: '9820077889',
    email: 'imran.mdh@example.com',
    address: 'Gala 7, Mangaldas Market, Kalbadevi',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400002',
    gstNumber: '27AABCM9034E1ZL',
    openingBalance: 0,
  },
  {
    ...meta('sup-ludhiana', 30, 'inactive'),
    name: 'Ludhiana Woollen Mills',
    contactPerson: 'Harpreet Singh',
    mobile: '9815098765',
    email: '',
    address: 'Plot 33, Industrial Area A',
    city: 'Ludhiana',
    state: 'Punjab',
    pincode: '141003',
    gstNumber: '03AAKFL5530Q1ZZ',
    openingBalance: 0,
  },
  {
    ...meta('sup-tailoring', 20),
    name: 'Local Tailoring Works',
    contactPerson: 'Murugan S',
    mobile: '9789012345',
    email: '',
    address: '4, Oppanakara Street',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    pincode: '641001',
    gstNumber: '',
    openingBalance: 2500,
  },
];

// ---- Customers ----------------------------------------------------------------------------------------

const customers: Customer[] = [
  {
    ...meta('cus-priya', 42),
    name: 'Priya Ramesh',
    mobile: '9876543210',
    email: 'priya.r@example.com',
    address: '12, Gandhi Street, RS Puram',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    pincode: '641002',
    gstNumber: '',
    openingBalance: 0,
  },
  {
    ...meta('cus-arun', 39),
    name: 'Arun Kumar',
    mobile: '9944556677',
    email: '',
    address: '45, Avinashi Road, Peelamedu',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    pincode: '641004',
    gstNumber: '',
    openingBalance: 1500,
  },
  {
    ...meta('cus-meena', 36),
    name: 'Meena Boutique',
    mobile: '9842233445',
    email: 'meenaboutique@example.com',
    address: '8, Cross Cut Road, Gandhipuram',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    pincode: '641012',
    gstNumber: '33AHVPR4410B1ZI',
    openingBalance: 12500,
  },
  {
    ...meta('cus-lakshmi', 31),
    name: 'Lakshmi Narayanan',
    mobile: '9790011223',
    email: '',
    address: '22, Kumaran Road',
    city: 'Tiruppur',
    state: 'Tamil Nadu',
    pincode: '641601',
    gstNumber: '',
    openingBalance: 0,
  },
  {
    ...meta('cus-sakthi', 27),
    name: 'Sri Sakthi Fashions',
    mobile: '9865432109',
    email: 'sakthifashions@example.com',
    address: '102, Big Bazaar Street',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    pincode: '641001',
    gstNumber: '33AAFCS2235N1ZA',
    openingBalance: 32000,
  },
  {
    ...meta('cus-fathima', 18),
    name: 'Fathima Begum',
    mobile: '9600123456',
    email: 'fathima.b@example.com',
    address: '7, New Scheme Road',
    city: 'Pollachi',
    state: 'Tamil Nadu',
    pincode: '642001',
    gstNumber: '',
    openingBalance: 0,
  },
  {
    ...meta('cus-karthik', 12),
    name: 'Karthik Subramanian',
    mobile: '9884098840',
    email: 'karthik.s@example.com',
    address: '3rd Floor, 21 Usman Road, T Nagar',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600017',
    gstNumber: '',
    openingBalance: 0,
  },
  {
    ...meta('cus-divya', 9, 'inactive'),
    name: 'Divya Menon',
    mobile: '9447012345',
    email: '',
    address: 'Near Fort Maidan',
    city: 'Palakkad',
    state: 'Kerala',
    pincode: '678001',
    gstNumber: '',
    openingBalance: 750,
  },
];

// ---- Products -----------------------------------------------------------------------------------------

const sizeName = (id: string) => sizes.find((s) => s.id === id)?.name ?? '';
const colorName = (id: string) => colors.find((c) => c.id === id)?.name ?? '';

type VariantSpec = [
  designNo: string,
  colorId: string,
  sizeId: string,
  overrides?: Partial<Pick<ProductVariant, 'barcode' | 'sellingPrice' | 'mrp' | 'purchasePrice'>>,
];

function product(
  base: Omit<Product, keyof BaseEntity | 'variants'>,
  id: string,
  daysAgo: number,
  variantSpecs: VariantSpec[],
  status: EntityStatus = 'active',
): Product {
  return {
    ...meta(id, daysAgo, status),
    ...base,
    variants: variantSpecs.map(([designNo, colorId, sizeId, overrides], index) => ({
      id: `${id}-v${index + 1}`,
      designNo,
      sizeId,
      colorId,
      sku: buildSku({
        productCode: base.code,
        designNo,
        colorName: colorName(colorId),
        sizeName: sizeName(sizeId),
      }),
      barcode: overrides?.barcode ?? '',
      purchasePrice: overrides?.purchasePrice ?? null,
      sellingPrice: overrides?.sellingPrice ?? null,
      mrp: overrides?.mrp ?? null,
    })),
  };
}

const products: Product[] = [
  product(
    {
      name: "Men's Cotton Casual Shirt",
      code: 'MSH-1001',
      categoryId: 'cat-shirts',
      brandId: 'brand-urban-weave',
      description: '100% cotton, regular fit, full sleeves with button-down collar.',
      productType: 'readymade',
      hsnCode: '6205',
      gstRate: 5,
      mrp: 1499,
      purchasePrice: 720,
      sellingPrice: 1299,
      barcode: '',
    },
    'prd-cotton-shirt',
    14,
    [
      ['101', 'color-black', 'size-m', { barcode: '8901234510011' }],
      ['101', 'color-black', 'size-l', { barcode: '8901234510028' }],
      ['101', 'color-white', 'size-m', { barcode: '8901234510035' }],
      ['101', 'color-white', 'size-l', { barcode: '8901234510042' }],
      [
        '102',
        'color-royal',
        'size-xl',
        { barcode: '8901234510059', sellingPrice: 1349, mrp: 1599 },
      ],
    ],
  ),
  product(
    {
      name: 'Slim Fit Stretch Jeans',
      code: 'JNS-2001',
      categoryId: 'cat-jeans',
      brandId: 'brand-blue-harbor',
      description: 'Mid-rise slim fit denim with 2% stretch.',
      productType: 'readymade',
      hsnCode: '6203',
      gstRate: 5,
      mrp: 2299,
      purchasePrice: 1100,
      sellingPrice: 1899,
      barcode: '',
    },
    'prd-slim-jeans',
    13,
    [
      ['BH-11', 'color-indigo', 'size-30'],
      ['BH-11', 'color-indigo', 'size-32'],
      ['BH-11', 'color-indigo', 'size-34'],
      ['BH-11', 'color-indigo', 'size-36'],
      ['BH-11', 'color-black', 'size-32'],
      ['BH-11', 'color-black', 'size-34'],
    ],
  ),
  product(
    {
      name: 'Printed Cotton Kurti',
      code: 'KRT-3001',
      categoryId: 'cat-kurtis',
      brandId: 'brand-kalaa',
      description: 'Straight-cut kurti with block print, three-quarter sleeves.',
      productType: 'readymade',
      hsnCode: '6204',
      gstRate: 5,
      mrp: 999,
      purchasePrice: 450,
      sellingPrice: 849,
      barcode: '',
    },
    'prd-printed-kurti',
    11,
    [
      ['K-21', 'color-mustard', 'size-s'],
      ['K-21', 'color-mustard', 'size-m'],
      ['K-21', 'color-mustard', 'size-l'],
      ['K-21', 'color-mustard', 'size-xl'],
      ['K-21', 'color-pink', 'size-m'],
      ['K-21', 'color-pink', 'size-l'],
      ['K-22', 'color-peach', 'size-m'],
      ['K-22', 'color-peach', 'size-l'],
    ],
  ),
  product(
    {
      name: 'Banarasi Silk Saree',
      code: 'SAR-4001',
      categoryId: 'cat-sarees',
      brandId: 'brand-silk-route',
      description: 'Pure silk with zari border. 5.5 m saree with 0.8 m blouse piece.',
      productType: 'fabric',
      hsnCode: '5007',
      gstRate: 5,
      mrp: 7999,
      purchasePrice: 4200,
      sellingPrice: 6999,
      barcode: '',
    },
    'prd-banarasi-saree',
    9,
    [
      ['BS-501', 'color-maroon', 'size-free'],
      ['BS-501', 'color-royal', 'size-free'],
      [
        'BS-502',
        'color-bottle-green',
        'size-free',
        { sellingPrice: 7999, mrp: 8999, purchasePrice: 4800 },
      ],
    ],
  ),
  product(
    {
      name: 'Kids Party Frock',
      code: 'KID-5001',
      categoryId: 'cat-kids',
      brandId: 'brand-little-sprouts',
      description: 'Net frock with satin lining and bow detail.',
      productType: 'readymade',
      hsnCode: '6204',
      gstRate: 5,
      mrp: 1299,
      purchasePrice: 560,
      sellingPrice: 1099,
      barcode: '',
    },
    'prd-party-frock',
    7,
    [
      ['LS-07', 'color-pink', 'size-2-3y'],
      ['LS-07', 'color-pink', 'size-4-5y'],
      ['LS-07', 'color-pink', 'size-6-7y'],
      ['LS-07', 'color-red', 'size-4-5y'],
    ],
  ),
  product(
    {
      name: 'Polo T-Shirt',
      code: 'TSH-6001',
      categoryId: 'cat-tshirts',
      brandId: 'brand-comfort-knit',
      description: 'Pique cotton polo with ribbed collar.',
      productType: 'readymade',
      hsnCode: '6105',
      gstRate: 5,
      mrp: 799,
      purchasePrice: 340,
      sellingPrice: 699,
      barcode: '',
    },
    'prd-polo-tshirt',
    5,
    [
      ['CK-PL', 'color-navy', 'size-s'],
      ['CK-PL', 'color-navy', 'size-m'],
      ['CK-PL', 'color-navy', 'size-l'],
      ['CK-PL', 'color-navy', 'size-xl'],
      ['CK-PL', 'color-white', 'size-m'],
      ['CK-PL', 'color-white', 'size-l'],
      ['CK-PL', 'color-grey', 'size-l'],
    ],
  ),
  product(
    {
      name: 'Chikankari Cotton Kurta',
      code: 'KUR-7001',
      categoryId: 'cat-kurtas',
      brandId: 'brand-noor',
      description: 'Hand-embroidered chikankari on soft cotton.',
      productType: 'readymade',
      hsnCode: '6205',
      gstRate: 5,
      mrp: 2499,
      purchasePrice: 1150,
      sellingPrice: 2199,
      barcode: '',
    },
    'prd-chikankari-kurta',
    3,
    [
      ['NE-30', 'color-white', 'size-m'],
      ['NE-30', 'color-white', 'size-l'],
      ['NE-30', 'color-white', 'size-xl'],
      ['NE-30', 'color-cream', 'size-l'],
    ],
  ),
  product(
    {
      name: 'Silk Blend Stole',
      code: 'ACC-8001',
      categoryId: 'cat-accessories',
      brandId: 'brand-house',
      description: 'Lightweight stole, 180 × 70 cm. Sold without variants.',
      productType: 'accessory',
      hsnCode: '6214',
      gstRate: 5,
      mrp: 599,
      purchasePrice: 220,
      sellingPrice: 499,
      barcode: '8909876500017',
    },
    'prd-silk-stole',
    2,
    [],
  ),
  product(
    {
      name: 'Linen Formal Trousers',
      code: 'TRS-9001',
      categoryId: 'cat-trousers',
      brandId: 'brand-regal',
      description: 'Linen-blend flat-front trousers.',
      productType: 'readymade',
      hsnCode: '6203',
      gstRate: 5,
      mrp: 1899,
      purchasePrice: 900,
      sellingPrice: 1599,
      barcode: '',
    },
    'prd-linen-trousers',
    1,
    [
      ['RT-04', 'color-beige', 'size-32'],
      ['RT-04', 'color-beige', 'size-34'],
      ['RT-04', 'color-grey', 'size-32'],
    ],
    'inactive',
  ),
];

export const MOCK_SEED: MockTables = {
  categories,
  brands,
  sizes,
  colors,
  suppliers,
  customers,
  products,
};
