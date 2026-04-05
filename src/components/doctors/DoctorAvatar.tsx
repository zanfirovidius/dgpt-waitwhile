'use client';

import type { DoctorRecord } from '@/lib/doctor-types';
import { getDoctorInitials } from '@/lib/doctor-utils';
import Image from 'next/image';

type DoctorAvatarProps = {
  doctor: Pick<DoctorRecord, '$id' | 'fullName' | 'profileImageUrl' | 'profileImageUploadedAt'>;
  size?: 'sm' | 'md' | 'lg';
};

const SIZE_CLASSES = {
  sm: 'h-10 w-10 text-xs',
  md: 'h-14 w-14 text-sm',
  lg: 'h-24 w-24 text-xl',
};

const SIZE_PIXELS = {
  sm: 40,
  md: 56,
  lg: 96,
};

export function DoctorAvatar({ doctor, size = 'md' }: DoctorAvatarProps) {
  const imageUrl = doctor.profileImageUrl
    ? `${doctor.profileImageUrl}${doctor.profileImageUrl.includes('?') ? '&' : '?'}t=${encodeURIComponent(doctor.profileImageUploadedAt || '')}`
    : '';

  return (
    <div className={`avatar ${SIZE_CLASSES[size]}`}>
      <div className={`rounded-2xl border border-base-300 bg-base-200 text-base-content/70 ${SIZE_CLASSES[size]} flex items-center justify-center overflow-hidden font-black`}>
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={doctor.fullName}
            width={SIZE_PIXELS[size]}
            height={SIZE_PIXELS[size]}
            unoptimized
            className="h-full w-full object-cover"
            sizes={`${SIZE_PIXELS[size]}px`}
          />
        ) : (
          <span>{getDoctorInitials(doctor)}</span>
        )}
      </div>
    </div>
  );
}
