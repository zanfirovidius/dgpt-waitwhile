'use client';

import type { DoctorRecord } from '@/lib/doctor-types';
import { getDoctorInitials } from '@/lib/doctor-utils';

type DoctorAvatarProps = {
  doctor: Pick<DoctorRecord, '$id' | 'fullName' | 'profileImageUrl' | 'profileImageUploadedAt'>;
  size?: 'sm' | 'md' | 'lg';
};

const SIZE_CLASSES = {
  sm: 'h-10 w-10 text-xs',
  md: 'h-14 w-14 text-sm',
  lg: 'h-24 w-24 text-xl',
};

export function DoctorAvatar({ doctor, size = 'md' }: DoctorAvatarProps) {
  const imageUrl = doctor.profileImageUrl
    ? `${doctor.profileImageUrl}${doctor.profileImageUrl.includes('?') ? '&' : '?'}t=${encodeURIComponent(doctor.profileImageUploadedAt || '')}`
    : '';

  return (
    <div className={`avatar ${SIZE_CLASSES[size]}`}>
      <div className={`rounded-2xl border border-base-300 bg-base-200 text-base-content/70 ${SIZE_CLASSES[size]} flex items-center justify-center overflow-hidden font-black`}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={doctor.fullName} className="h-full w-full object-cover" />
        ) : (
          <span>{getDoctorInitials(doctor)}</span>
        )}
      </div>
    </div>
  );
}
