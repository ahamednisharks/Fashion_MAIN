export interface IndianState {
  /** Two-digit GST state code (first two characters of a GSTIN). */
  readonly gstCode: string;
  readonly name: string;
}

/** States and Union Territories with their GST state codes (same list as the frontend). */
export const INDIAN_STATES: readonly IndianState[] = [
  { gstCode: '35', name: 'Andaman and Nicobar Islands' },
  { gstCode: '37', name: 'Andhra Pradesh' },
  { gstCode: '12', name: 'Arunachal Pradesh' },
  { gstCode: '18', name: 'Assam' },
  { gstCode: '10', name: 'Bihar' },
  { gstCode: '04', name: 'Chandigarh' },
  { gstCode: '22', name: 'Chhattisgarh' },
  { gstCode: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { gstCode: '07', name: 'Delhi' },
  { gstCode: '30', name: 'Goa' },
  { gstCode: '24', name: 'Gujarat' },
  { gstCode: '06', name: 'Haryana' },
  { gstCode: '02', name: 'Himachal Pradesh' },
  { gstCode: '01', name: 'Jammu and Kashmir' },
  { gstCode: '20', name: 'Jharkhand' },
  { gstCode: '29', name: 'Karnataka' },
  { gstCode: '32', name: 'Kerala' },
  { gstCode: '38', name: 'Ladakh' },
  { gstCode: '31', name: 'Lakshadweep' },
  { gstCode: '23', name: 'Madhya Pradesh' },
  { gstCode: '27', name: 'Maharashtra' },
  { gstCode: '14', name: 'Manipur' },
  { gstCode: '17', name: 'Meghalaya' },
  { gstCode: '15', name: 'Mizoram' },
  { gstCode: '13', name: 'Nagaland' },
  { gstCode: '21', name: 'Odisha' },
  { gstCode: '34', name: 'Puducherry' },
  { gstCode: '03', name: 'Punjab' },
  { gstCode: '08', name: 'Rajasthan' },
  { gstCode: '11', name: 'Sikkim' },
  { gstCode: '33', name: 'Tamil Nadu' },
  { gstCode: '36', name: 'Telangana' },
  { gstCode: '16', name: 'Tripura' },
  { gstCode: '09', name: 'Uttar Pradesh' },
  { gstCode: '05', name: 'Uttarakhand' },
  { gstCode: '19', name: 'West Bengal' },
];

export const INDIAN_STATE_NAMES = INDIAN_STATES.map((state) => state.name);

export function findStateByGstCode(code: string): IndianState | undefined {
  return INDIAN_STATES.find((state) => state.gstCode === code);
}
