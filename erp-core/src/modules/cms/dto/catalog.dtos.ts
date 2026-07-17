import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BannerPlacement } from '@prisma/client';

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameAr?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  slug!: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameAr?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateBannerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsUUID()
  imageFileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  linkUrl?: string;

  @IsOptional()
  @IsEnum(BannerPlacement)
  placement?: BannerPlacement;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  priority?: number;
}

export class UpdateBannerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  linkUrl?: string;

  @IsOptional()
  @IsEnum(BannerPlacement)
  placement?: BannerPlacement;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class CreatePopupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  linkUrl?: string;

  @IsOptional()
  @IsBoolean()
  showInApp?: boolean;

  @IsOptional()
  @IsBoolean()
  showInWebsite?: boolean;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;
}

export class UpdatePopupDto extends CreatePopupDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  declare title: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class MenuItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  labelAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string;

  @IsOptional()
  @IsUUID()
  contentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  children?: MenuItemDto[];
}

export class UpsertMenuDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  key!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuItemDto)
  items!: MenuItemDto[];
}

export class FeatureCampaignDto {
  @IsUUID()
  campaignId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}
