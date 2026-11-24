export interface Customer {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly phone: string;
}

export type CustomerData = Omit<Customer, 'id'>;
