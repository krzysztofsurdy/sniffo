<?php
namespace App\Enum;
enum OrderStatus: string {
    case Pending = 'pending';
    case Completed = 'completed';
    case Cancelled = 'cancelled';
}
