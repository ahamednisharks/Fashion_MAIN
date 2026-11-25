/*
 * Demo master data (mirrors the frontend's mock data). Brand and business names are fictional,
 * emails use example.com and GSTINs are format- and checksum-valid test values.
 */

type Status = 'active' | 'inactive';

export interface SeedNamed {
  name: string;
  description: string;
  status?: Status;
}

export const categories: SeedNamed[] = [
  { name: "Men's Shirts", description: 'Formal and casual shirts for men' },
  { name: "Men's T-Shirts", description: 'Round neck, polo and henley T-shirts' },
  { name: 'Jeans', description: 'Denim jeans for men and women' },
  { name: 'Trousers', description: 'Formal trousers and chinos' },
  { name: "Men's Kurtas", description: 'Kurtas and kurta sets for men' },
  { name: "Women's Kurtis", description: 'Straight, A-line and anarkali kurtis' },
  { name: 'Sarees', description: 'Silk, cotton and designer sarees' },
  { name: 'Salwar Suits', description: 'Readymade and unstitched salwar suits' },
  { name: 'Lehengas', description: 'Bridal and party wear lehengas' },
  { name: 'Kids Wear', description: 'Clothing for boys and girls up to 14 years' },
  { name: "Women's Western Wear", description: 'Dresses, tops and co-ord sets' },
  { name: 'Accessories', description: 'Dupattas, stoles, belts and more' },
  { name: 'Winter Wear', description: 'Sweaters, jackets and shawls', status: 'inactive' },
];

export const brands: SeedNamed[] = [
  { name: 'Urban Weave', description: 'Casual menswear' },
  { name: 'Regal Threads', description: 'Formal shirts and trousers' },
  { name: 'Blue Harbor Denim', description: 'Denim and casual wear' },
  { name: 'Kalaa', description: 'Everyday ethnic wear for women' },
  { name: 'Silk Route', description: 'Handloom and silk sarees' },
  { name: 'Noor Ethnic', description: 'Festive and occasion wear' },
  { name: 'Little Sprouts', description: 'Kidswear' },
  { name: 'Comfort Knit', description: 'T-shirts and knitwear' },
  { name: 'Shop Label', description: 'Our in-house label' },
  { name: 'Vintage Loom', description: 'Discontinued label', status: 'inactive' },
];

export const sizes: {
  name: string;
  type: 'clothing' | 'numeric' | 'custom';
  description: string;
}[] = [
  { name: 'XS', type: 'clothing', description: 'Chest 34–36 in' },
  { name: 'S', type: 'clothing', description: 'Chest 36–38 in' },
  { name: 'M', type: 'clothing', description: 'Chest 38–40 in' },
  { name: 'L', type: 'clothing', description: 'Chest 40–42 in' },
  { name: 'XL', type: 'clothing', description: 'Chest 42–44 in' },
  { name: 'XXL', type: 'clothing', description: 'Chest 44–46 in' },
  { name: '3XL', type: 'clothing', description: 'Chest 46–48 in' },
  { name: '28', type: 'numeric', description: 'Waist 28 in' },
  { name: '30', type: 'numeric', description: 'Waist 30 in' },
  { name: '32', type: 'numeric', description: 'Waist 32 in' },
  { name: '34', type: 'numeric', description: 'Waist 34 in' },
  { name: '36', type: 'numeric', description: 'Waist 36 in' },
  { name: '38', type: 'numeric', description: 'Waist 38 in' },
  { name: '40', type: 'numeric', description: 'Waist 40 in' },
  { name: 'Free Size', type: 'custom', description: 'One size fits most' },
  { name: '2-3 Y', type: 'custom', description: 'Kids, 2 to 3 years' },
  { name: '4-5 Y', type: 'custom', description: 'Kids, 4 to 5 years' },
  { name: '6-7 Y', type: 'custom', description: 'Kids, 6 to 7 years' },
  { name: '8-9 Y', type: 'custom', description: 'Kids, 8 to 9 years' },
];

export const colors: { name: string; hexCode: string; description?: string; status?: Status }[] = [
  { name: 'Black', hexCode: '#1C1C1C' },
  { name: 'White', hexCode: '#FFFFFF' },
  { name: 'Navy Blue', hexCode: '#1F2A5A' },
  { name: 'Sky Blue', hexCode: '#7EC8E3' },
  { name: 'Royal Blue', hexCode: '#2B50AA' },
  { name: 'Indigo Denim', hexCode: '#3B4A6B', description: 'Classic denim wash' },
  { name: 'Maroon', hexCode: '#800020' },
  { name: 'Red', hexCode: '#C62828' },
  { name: 'Bottle Green', hexCode: '#0B5D3B' },
  { name: 'Olive', hexCode: '#708238' },
  { name: 'Beige', hexCode: '#E8D8C3' },
  { name: 'Grey', hexCode: '#8A8D91', description: 'Mid grey / heather' },
  { name: 'Mustard', hexCode: '#D4A017' },
  { name: 'Pink', hexCode: '#E75480' },
  { name: 'Peach', hexCode: '#FFCBA4' },
  { name: 'Cream', hexCode: '#FFF5D6', description: 'Off-white / ivory' },
  { name: 'Gold', hexCode: '#C9A227', description: 'Zari and festive gold' },
  {
    name: 'Neon Green',
    hexCode: '#39FF14',
    description: 'Seasonal — not restocked',
    status: 'inactive',
  },
];

export interface SeedParty {
  name: string;
  contactPerson?: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstNumber: string;
  openingBalance: number;
  status?: Status;
}

export const suppliers: SeedParty[] = [
  {
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
    status: 'inactive',
  },
  {
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

export const customers: SeedParty[] = [
  {
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
    name: 'Divya Menon',
    mobile: '9447012345',
    email: '',
    address: 'Near Fort Maidan',
    city: 'Palakkad',
    state: 'Kerala',
    pincode: '678001',
    gstNumber: '',
    openingBalance: 750,
    status: 'inactive',
  },
];

/** [designNo, colour name, size name, overrides] */
export type SeedVariant = [
  designNo: string,
  color: string,
  size: string,
  overrides?: { barcode?: string; sellingPrice?: number; mrp?: number; purchasePrice?: number },
];

export interface SeedProduct {
  name: string;
  code: string;
  category: string;
  brand: string | null;
  description: string;
  productType: 'readymade' | 'fabric' | 'accessory' | 'footwear' | 'other';
  hsnCode: string;
  gstRate: number;
  mrp: number;
  purchasePrice: number | null;
  sellingPrice: number;
  barcode: string;
  status?: Status;
  variants: SeedVariant[];
}

export const products: SeedProduct[] = [
  {
    name: "Men's Cotton Casual Shirt",
    code: 'MSH-1001',
    category: "Men's Shirts",
    brand: 'Urban Weave',
    description: '100% cotton, regular fit, full sleeves with button-down collar.',
    productType: 'readymade',
    hsnCode: '6205',
    gstRate: 5,
    mrp: 1499,
    purchasePrice: 720,
    sellingPrice: 1299,
    barcode: '',
    variants: [
      ['101', 'Black', 'M', { barcode: '8901234510011' }],
      ['101', 'Black', 'L', { barcode: '8901234510028' }],
      ['101', 'White', 'M', { barcode: '8901234510035' }],
      ['101', 'White', 'L', { barcode: '8901234510042' }],
      ['102', 'Royal Blue', 'XL', { barcode: '8901234510059', sellingPrice: 1349, mrp: 1599 }],
    ],
  },
  {
    name: 'Slim Fit Stretch Jeans',
    code: 'JNS-2001',
    category: 'Jeans',
    brand: 'Blue Harbor Denim',
    description: 'Mid-rise slim fit denim with 2% stretch.',
    productType: 'readymade',
    hsnCode: '6203',
    gstRate: 5,
    mrp: 2299,
    purchasePrice: 1100,
    sellingPrice: 1899,
    barcode: '',
    variants: [
      ['BH-11', 'Indigo Denim', '30'],
      ['BH-11', 'Indigo Denim', '32'],
      ['BH-11', 'Indigo Denim', '34'],
      ['BH-11', 'Indigo Denim', '36'],
      ['BH-11', 'Black', '32'],
      ['BH-11', 'Black', '34'],
    ],
  },
  {
    name: 'Printed Cotton Kurti',
    code: 'KRT-3001',
    category: "Women's Kurtis",
    brand: 'Kalaa',
    description: 'Straight-cut kurti with block print, three-quarter sleeves.',
    productType: 'readymade',
    hsnCode: '6204',
    gstRate: 5,
    mrp: 999,
    purchasePrice: 450,
    sellingPrice: 849,
    barcode: '',
    variants: [
      ['K-21', 'Mustard', 'S'],
      ['K-21', 'Mustard', 'M'],
      ['K-21', 'Mustard', 'L'],
      ['K-21', 'Mustard', 'XL'],
      ['K-21', 'Pink', 'M'],
      ['K-21', 'Pink', 'L'],
      ['K-22', 'Peach', 'M'],
      ['K-22', 'Peach', 'L'],
    ],
  },
  {
    name: 'Banarasi Silk Saree',
    code: 'SAR-4001',
    category: 'Sarees',
    brand: 'Silk Route',
    description: 'Pure silk with zari border. 5.5 m saree with 0.8 m blouse piece.',
    productType: 'fabric',
    hsnCode: '5007',
    gstRate: 5,
    mrp: 7999,
    purchasePrice: 4200,
    sellingPrice: 6999,
    barcode: '',
    variants: [
      ['BS-501', 'Maroon', 'Free Size'],
      ['BS-501', 'Royal Blue', 'Free Size'],
      [
        'BS-502',
        'Bottle Green',
        'Free Size',
        { sellingPrice: 7999, mrp: 8999, purchasePrice: 4800 },
      ],
    ],
  },
  {
    name: 'Kids Party Frock',
    code: 'KID-5001',
    category: 'Kids Wear',
    brand: 'Little Sprouts',
    description: 'Net frock with satin lining and bow detail.',
    productType: 'readymade',
    hsnCode: '6204',
    gstRate: 5,
    mrp: 1299,
    purchasePrice: 560,
    sellingPrice: 1099,
    barcode: '',
    variants: [
      ['LS-07', 'Pink', '2-3 Y'],
      ['LS-07', 'Pink', '4-5 Y'],
      ['LS-07', 'Pink', '6-7 Y'],
      ['LS-07', 'Red', '4-5 Y'],
    ],
  },
  {
    name: 'Polo T-Shirt',
    code: 'TSH-6001',
    category: "Men's T-Shirts",
    brand: 'Comfort Knit',
    description: 'Pique cotton polo with ribbed collar.',
    productType: 'readymade',
    hsnCode: '6105',
    gstRate: 5,
    mrp: 799,
    purchasePrice: 340,
    sellingPrice: 699,
    barcode: '',
    variants: [
      ['CK-PL', 'Navy Blue', 'S'],
      ['CK-PL', 'Navy Blue', 'M'],
      ['CK-PL', 'Navy Blue', 'L'],
      ['CK-PL', 'Navy Blue', 'XL'],
      ['CK-PL', 'White', 'M'],
      ['CK-PL', 'White', 'L'],
      ['CK-PL', 'Grey', 'L'],
    ],
  },
  {
    name: 'Chikankari Cotton Kurta',
    code: 'KUR-7001',
    category: "Men's Kurtas",
    brand: 'Noor Ethnic',
    description: 'Hand-embroidered chikankari on soft cotton.',
    productType: 'readymade',
    hsnCode: '6205',
    gstRate: 5,
    mrp: 2499,
    purchasePrice: 1150,
    sellingPrice: 2199,
    barcode: '',
    variants: [
      ['NE-30', 'White', 'M'],
      ['NE-30', 'White', 'L'],
      ['NE-30', 'White', 'XL'],
      ['NE-30', 'Cream', 'L'],
    ],
  },
  {
    name: 'Silk Blend Stole',
    code: 'ACC-8001',
    category: 'Accessories',
    brand: 'Shop Label',
    description: 'Lightweight stole, 180 × 70 cm. Sold without variants.',
    productType: 'accessory',
    hsnCode: '6214',
    gstRate: 5,
    mrp: 599,
    purchasePrice: 220,
    sellingPrice: 499,
    barcode: '8909876500017',
    variants: [],
  },
  {
    name: 'Linen Formal Trousers',
    code: 'TRS-9001',
    category: 'Trousers',
    brand: 'Regal Threads',
    description: 'Linen-blend flat-front trousers.',
    productType: 'readymade',
    hsnCode: '6203',
    gstRate: 5,
    mrp: 1899,
    purchasePrice: 900,
    sellingPrice: 1599,
    barcode: '',
    status: 'inactive',
    variants: [
      ['RT-04', 'Beige', '32'],
      ['RT-04', 'Beige', '34'],
      ['RT-04', 'Grey', '32'],
    ],
  },
];

// ---- SKU builder (same rules as the frontend's auto-SKU) -------------------------------------

function colorSkuCode(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/CK/g, 'K')
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const consonants = (word: string) => word.slice(1).replace(/[AEIOU]/g, '');
  const last = words[words.length - 1] ?? '';
  let code =
    words.length > 1
      ? words.map((w) => w[0]).join('') + consonants(last)
      : (words[0]?.[0] ?? '') + consonants(words[0] ?? '');
  if (code.length < 3) code = words.join('').slice(0, 3);
  return code.slice(0, 3);
}

const skuPart = (value: string, max: number) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);

export function buildSku(code: string, designNo: string, color: string, size: string): string {
  return [skuPart(code, 20), skuPart(designNo, 12), colorSkuCode(color), skuPart(size, 8)]
    .filter(Boolean)
    .join('-');
}
