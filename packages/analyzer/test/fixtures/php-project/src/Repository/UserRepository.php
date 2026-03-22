<?php
declare(strict_types=1);

namespace App\Repository;

use App\Model\User;

class UserRepository extends BaseRepository
{
    public function find(int $id): ?array
    {
        return null;
    }

    public function findAll(): array
    {
        return [];
    }

    public function findByStatus(string $status): array
    {
        return [];
    }
}
