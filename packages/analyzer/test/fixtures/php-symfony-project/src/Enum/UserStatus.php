<?php
namespace App\Enum;
enum UserStatus: string {
    case Active = 'active';
    case Inactive = 'inactive';
    case Banned = 'banned';
}
