<?php
declare(strict_types=1);

namespace App\Repository;

abstract class BaseRepository
{
    abstract public function find(int $id): ?array;
    abstract public function findAll(): array;
}
