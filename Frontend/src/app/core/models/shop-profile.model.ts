import { PostalAddress } from './base.model';

/** Shop details printed on bills (stored on the server — Settings → Shop profile). */
export interface ShopProfile extends PostalAddress {
  shopName: string;
  phone: string;
  email: string;
  gstNumber: string;
}

export const EMPTY_SHOP_PROFILE: ShopProfile = {
  shopName: '',
  phone: '',
  email: '',
  gstNumber: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
};
